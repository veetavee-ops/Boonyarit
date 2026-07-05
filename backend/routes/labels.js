// routes/labels.js — จัดการ CRUD labels และการ assign กลุ่มเข้า label
// label เป็นของแต่ละ admin แยกกัน (ไม่แชร์ข้าม user) ทุก route เลยกรองด้วย req.admin.id เสมอ
const express = require('express');
const router = express.Router();
const { Label, GroupLabel } = require('../models/index');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/labels — ดึง label ของ admin คนนี้เท่านั้น พร้อม groupId ที่ assign ไว้ใน label นั้น
router.get('/', async (req, res) => {
  try {
    // ดึงเฉพาะ label ของ admin คนที่ login อยู่ รวมถึง assignments (ว่า label นี้มีกลุ่มไหนบ้าง)
    const labels = await Label.findAll({
      where: { adminId: req.admin.id },
      include: [{ model: GroupLabel, as: 'assignments', attributes: ['groupId'] }],
      order: [['id', 'ASC']],
    });

    // แปลงข้อมูลให้ groupIds เป็น array แบน เช่น ["Cxxx", "Cyyy"]
    const result = labels.map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      groupIds: l.assignments.map((a) => a.groupId),
    }));

    res.json(result);
  } catch (err) {
    console.error('[ERROR] GET /api/labels:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/labels — สร้าง label ใหม่
// body: { name: "ชื่อ", color: "#hex" }
router.post('/', async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'ต้องระบุชื่อ label' });
    }
    // บันทึก label ลงในตาราง Labels — ผูกกับ admin คนที่สร้าง
    const label = await Label.create({ adminId: req.admin.id, name: name.trim(), color: color || '#3b82f6' });
    res.json({ id: label.id, name: label.name, color: label.color, groupIds: [] });
  } catch (err) {
    console.error('[ERROR] POST /api/labels:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// เช็คว่า label นี้เป็นของ admin ที่ login อยู่จริงไหม กันไม่ให้แก้/ลบ label ของคนอื่น
async function findOwnLabel(labelId, adminId) {
  return Label.findOne({ where: { id: labelId, adminId } });
}

// DELETE /api/labels/:id — ลบ label (ลบ assignments ออกด้วย)
router.delete('/:id', async (req, res) => {
  try {
    const label = await findOwnLabel(req.params.id, req.admin.id);
    if (!label) return res.status(404).json({ error: 'ไม่พบ label นี้' });
    // ลบ assignments ก่อน (เพื่อไม่ให้ foreign key error)
    await GroupLabel.destroy({ where: { labelId: req.params.id } });
    // แล้วค่อยลบ label
    await label.destroy();
    res.json({ ok: true });
  } catch (err) {
    console.error('[ERROR] DELETE /api/labels/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/labels/:id/assign — เพิ่มกลุ่มเข้า label
// body: { groupId: "Cxxx..." }
router.post('/:id/assign', async (req, res) => {
  try {
    const label = await findOwnLabel(req.params.id, req.admin.id);
    if (!label) return res.status(404).json({ error: 'ไม่พบ label นี้' });
    const { groupId } = req.body;
    // findOrCreate ป้องกันการ assign ซ้ำ
    await GroupLabel.findOrCreate({ where: { labelId: req.params.id, groupId } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[ERROR] POST /api/labels/:id/assign:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/labels/:id/assign/:groupId — เอากลุ่มออกจาก label
router.delete('/:id/assign/:groupId', async (req, res) => {
  try {
    const label = await findOwnLabel(req.params.id, req.admin.id);
    if (!label) return res.status(404).json({ error: 'ไม่พบ label นี้' });
    await GroupLabel.destroy({
      where: { labelId: req.params.id, groupId: req.params.groupId },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[ERROR] DELETE /api/labels/:id/assign/:groupId:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
