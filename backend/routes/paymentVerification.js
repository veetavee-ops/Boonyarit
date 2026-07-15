// API สำหรับหน้า Dashboard ตรวจสอบการโอน-จ่ายเงิน
// จำกัดสิทธิ์เฉพาะ role admin/superuser เท่านั้น — staff ที่มีสิทธิ์เห็นกลุ่มผ่าน AdminGroup ปกติ
// ไม่มีสิทธิ์เข้าหน้านี้เลย เพราะเป็นข้อมูลตรวจสอบภายในของเจ้าของ ไม่ใช่ของพนักงาน
const express = require('express');
const router = express.Router();
const { PaymentVerification, Group, AccountLedgerEntry } = require('../models/index');
const authMiddleware = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');
const { syncLedgerForVerification } = require('../services/ledgerService');
const { Op } = require('sequelize');

router.use(authMiddleware);
router.use(requireAdmin);

// GET /api/payment-verification?groupId=&status=
router.get('/', async (req, res) => {
    try {
        const { groupId, status } = req.query;
        const where = {};
        if (groupId) where.groupId = groupId;
        if (status) where.overallStatus = status;

        const records = await PaymentVerification.findAll({
            where,
            include: [{ model: Group, as: 'group', attributes: ['groupName', 'pictureUrl'] }],
            order: [['submittedAt', 'DESC']],
            limit: 200,
        });
        res.json(records);
    } catch (error) {
        console.error('[ERROR] GET /api/payment-verification:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/payment-verification/accounts — สรุปยอดคงเหลือ+รวมรายรับ-รายจ่ายต่อบัญชี (groupId ที่ติดธง
// isPaymentVerifyGroup) ยอดคงเหลือล่าสุดดึงจาก endingBalance ของ submission ล่าสุดตรงๆ (ground truth
// จากรูปธนาคารจริง ไม่ใช่ค่าคำนวณเดา) ส่วน totalIn/totalOut/entryCount รวมจาก ledger entries ทั้งหมด
// ต้องอยู่ก่อน GET /:id เพราะ Express match route ตามลำดับประกาศ ไม่ใช่ตาม specificity
router.get('/accounts', async (req, res) => {
    try {
        const groups = await Group.findAll({
            where: { isPaymentVerifyGroup: true },
            attributes: ['groupId', 'groupName', 'pictureUrl'],
        });

        const results = await Promise.all(groups.map(async (group) => {
            const latest = await PaymentVerification.findOne({
                where: { groupId: group.groupId },
                order: [['submittedAt', 'DESC']],
                attributes: ['endingBalance', 'submittedAt'],
            });

            const entries = await AccountLedgerEntry.findAll({
                where: { groupId: group.groupId },
                attributes: ['direction', 'amount'],
            });
            const totalIn = entries.filter(e => e.direction === 'in').reduce((sum, e) => sum + Number(e.amount), 0);
            const totalOut = entries.filter(e => e.direction === 'out').reduce((sum, e) => sum + Number(e.amount), 0);

            return {
                groupId: group.groupId,
                groupName: group.groupName,
                pictureUrl: group.pictureUrl,
                latestBalance: latest?.endingBalance ?? null,
                latestSubmittedAt: latest?.submittedAt ?? null,
                totalIn,
                totalOut,
                entryCount: entries.length,
            };
        }));

        res.json(results);
    } catch (error) {
        console.error('[ERROR] GET /api/payment-verification/accounts:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/payment-verification/ledger?groupId=&limit=&before= — รายการ ledger ของบัญชีเดียว
// เรียงใหม่→เก่า, cursor pagination ด้วย occurredAt (แบบเดียวกับ pattern โหลดข้อความเก่าใน messages.js)
// ต้องอยู่ก่อน GET /:id เช่นกัน
router.get('/ledger', async (req, res) => {
    try {
        const { groupId, limit = 50, before } = req.query;
        if (!groupId) return res.status(400).json({ error: 'groupId is required' });

        const where = { groupId };
        if (before) where.occurredAt = { [Op.lt]: new Date(before) };

        const entries = await AccountLedgerEntry.findAll({
            where,
            order: [['occurredAt', 'DESC'], ['sortOrder', 'ASC']],
            limit: parseInt(limit, 10),
        });

        res.json(entries);
    } catch (error) {
        console.error('[ERROR] GET /api/payment-verification/ledger:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/payment-verification/:id
router.get('/:id', async (req, res) => {
    try {
        const record = await PaymentVerification.findByPk(req.params.id, {
            include: [{ model: Group, as: 'group', attributes: ['groupName', 'pictureUrl'] }],
        });
        if (!record) return res.status(404).json({ error: 'ไม่พบรายการ' });
        res.json(record);
    } catch (error) {
        console.error('[ERROR] GET /api/payment-verification/:id:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// PATCH /api/payment-verification/:id — แก้ไขรายการด้วยมือหลัง AI อ่านผิด
// body: { reportItems?, bankItems?, matchResults?, overallStatus?, correctionNote? }
router.patch('/:id', async (req, res) => {
    try {
        const record = await PaymentVerification.findByPk(req.params.id);
        if (!record) return res.status(404).json({ error: 'ไม่พบรายการ' });

        const { reportItems, bankItems, matchResults, overallStatus, correctionNote } = req.body;
        const updates = {
            correctedBy: req.admin.id,
            correctedAt: new Date(),
        };
        if (reportItems !== undefined) updates.reportItems = reportItems;
        if (bankItems !== undefined) updates.bankItems = bankItems;
        if (matchResults !== undefined) updates.matchResults = matchResults;
        if (overallStatus !== undefined) updates.overallStatus = overallStatus;
        else updates.overallStatus = 'corrected';
        if (correctionNote !== undefined) updates.correctionNote = correctionNote;

        await record.update(updates);

        // bankItems แก้ไขแล้ว → sync ledger entries ให้ตรงกับข้อมูลล่าสุด (ไม่งั้นยอดคงเหลือค้างข้อมูลเก่า)
        if (bankItems !== undefined) {
            try {
                await syncLedgerForVerification(record);
            } catch (e) {
                console.error('❌ Ledger sync fail (correction):', e.message);
            }
        }

        res.json(record);
    } catch (error) {
        console.error('[ERROR] PATCH /api/payment-verification/:id:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
