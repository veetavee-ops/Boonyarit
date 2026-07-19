// API สำหรับฟีเจอร์ "เช็คยอดสมุดบัญชี" (ยืม-คืนเงิน) — คนละฟีเจอร์กับ payment-verification
// (รายงานตั้งเบิก vs สกรีนธนาคาร) จำกัดสิทธิ์เฉพาะ role admin/superuser เท่านั้นเหมือนกัน เพราะเป็น
// ข้อมูลการเงินภายใน — v1 นี้เป็น read-only endpoints ไว้รองรับ dashboard ในอนาคต (ยังไม่มีหน้า UI)
const express = require('express');
const router = express.Router();
const { LedgerBalanceEntry, Group } = require('../models/index');
const authMiddleware = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');
const { applyCorrectionAndRecalculate } = require('../services/ledgerBalanceService');

router.use(authMiddleware);
router.use(requireAdmin);

// GET /api/ledger-balance?groupId=&status=
router.get('/', async (req, res) => {
    try {
        const { groupId, status } = req.query;
        const where = {};
        if (groupId) where.groupId = groupId;
        if (status) where.status = status;

        const records = await LedgerBalanceEntry.findAll({
            where,
            include: [{ model: Group, as: 'group', attributes: ['groupName', 'pictureUrl'] }],
            order: [['submittedAt', 'DESC']],
            limit: 200,
        });
        res.json(records);
    } catch (error) {
        console.error('[ERROR] GET /api/ledger-balance:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/ledger-balance/accounts — สรุปยอดปัจจุบันต่อบริษัท (groupId ที่ติดธง isLedgerBalanceGroup)
// latestBalance = calculatedBalance ของแถวล่าสุด — ค่านี้คือ ground truth จริง (ระบบจำยอดเอง ไม่ใช่
// ค่าอ่านจากรูปสมุดสดๆ ทุกครั้ง) ต้องอยู่ก่อน GET /:id เพราะ Express match route ตามลำดับประกาศ
router.get('/accounts', async (req, res) => {
    try {
        const groups = await Group.findAll({
            where: { isLedgerBalanceGroup: true },
            attributes: ['groupId', 'groupName', 'pictureUrl', 'ledgerReferenceName'],
        });

        const results = await Promise.all(groups.map(async (group) => {
            const latest = await LedgerBalanceEntry.findOne({
                where: { groupId: group.groupId },
                order: [['submittedAt', 'DESC']],
            });

            const entries = await LedgerBalanceEntry.findAll({
                where: { groupId: group.groupId, entryType: 'transaction' },
                attributes: ['direction', 'amount', 'matchesWrittenBalance'],
            });
            const totalIn = entries.filter(e => e.direction === 'in').reduce((sum, e) => sum + Number(e.amount), 0);
            const totalOut = entries.filter(e => e.direction === 'out').reduce((sum, e) => sum + Number(e.amount), 0);
            const pendingWrittenCheckCount = entries.filter(e => e.matchesWrittenBalance === null).length;

            return {
                groupId: group.groupId,
                groupName: group.groupName,
                pictureUrl: group.pictureUrl,
                ledgerReferenceName: group.ledgerReferenceName,
                latestBalance: latest?.calculatedBalance ?? null,
                latestSubmittedAt: latest?.submittedAt ?? null,
                totalIn,
                totalOut,
                entryCount: entries.length,
                pendingWrittenCheckCount,
            };
        }));

        res.json(results);
    } catch (error) {
        console.error('[ERROR] GET /api/ledger-balance/accounts:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/ledger-balance/:id
router.get('/:id', async (req, res) => {
    try {
        const record = await LedgerBalanceEntry.findByPk(req.params.id, {
            include: [{ model: Group, as: 'group', attributes: ['groupName', 'pictureUrl'] }],
        });
        if (!record) return res.status(404).json({ error: 'ไม่พบรายการ' });
        res.json(record);
    } catch (error) {
        console.error('[ERROR] GET /api/ledger-balance/:id:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// PATCH /api/ledger-balance/:id — แก้ไขรายการด้วยมือหลัง AI อ่านผิด (amount/direction/occurredAt/
// correctionNote) — คำนวณยอดใหม่ต่อเนื่องให้ทุกรายการหลังจากนี้ในกลุ่มเดียวกันด้วย (ดู ledgerBalanceService.js)
// body: { amount?, direction?, occurredAt?, correctionNote? }
router.patch('/:id', async (req, res) => {
    try {
        const { amount, direction, occurredAt, correctionNote } = req.body;
        if (direction !== undefined && direction !== 'in' && direction !== 'out') {
            return res.status(400).json({ error: 'direction ต้องเป็น "in" หรือ "out"' });
        }

        const updates = {};
        if (amount !== undefined) updates.amount = amount;
        if (direction !== undefined) updates.direction = direction;
        if (occurredAt !== undefined) updates.occurredAt = occurredAt;
        if (correctionNote !== undefined) updates.correctionNote = correctionNote;

        const record = await applyCorrectionAndRecalculate(req.params.id, updates, req.admin.id);
        res.json(record);
    } catch (error) {
        console.error('[ERROR] PATCH /api/ledger-balance/:id:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
