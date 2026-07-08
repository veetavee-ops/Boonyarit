// API สำหรับหน้า Dashboard ตรวจสอบการโอน-จ่ายเงิน
// จำกัดสิทธิ์เฉพาะ role admin/superuser เท่านั้น — staff ที่มีสิทธิ์เห็นกลุ่มผ่าน AdminGroup ปกติ
// ไม่มีสิทธิ์เข้าหน้านี้เลย เพราะเป็นข้อมูลตรวจสอบภายในของเจ้าของ ไม่ใช่ของพนักงาน
const express = require('express');
const router = express.Router();
const { PaymentVerification, Group } = require('../models/index');
const authMiddleware = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');

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
        res.json(record);
    } catch (error) {
        console.error('[ERROR] PATCH /api/payment-verification/:id:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
