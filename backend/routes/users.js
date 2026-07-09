const express = require('express');
const router = express.Router();
const { Op, fn, col } = require('sequelize');
const { Admin, AdminGroup, Message } = require('../models/index');
const authMiddleware = require('../middleware/auth');
const { requireAdmin, requireSuperuser } = require('../middleware/auth');

router.use(authMiddleware, requireAdmin);

// หา groupId ทั้งหมดที่ LINE user คนนี้เคยส่งข้อความไว้ แล้ว assign สิทธิ์ให้ adminId อัตโนมัติ
// (ไม่ต้องมานั่งติ๊ก checkbox เอง — เดาจากประวัติแชทได้เลยว่าเขาอยู่กลุ่มไหนบ้าง)
async function autoAssignGroupsFromLineHistory(adminId, lineUserId) {
  if (!lineUserId) return;
  const rows = await Message.findAll({
    where: { userId: lineUserId, groupId: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
    attributes: [[fn('DISTINCT', col('groupId')), 'groupId']],
    raw: true,
  });
  const groupIds = rows.map((r) => r.groupId);

  // ถ้าเคยทัก DM (private chat) กับ OA มาก่อน ก็ assign pseudo-group "private_<lineUserId>" ให้ด้วย
  const hasDm = await Message.findOne({
    where: { userId: lineUserId, groupId: { [Op.or]: [null, ''] } },
    attributes: ['id'],
  });
  if (hasDm) groupIds.push(`private_${lineUserId}`);

  await Promise.all(
    groupIds.map((groupId) => AdminGroup.findOrCreate({ where: { adminId, groupId } })),
  );
}

// GET /api/users — list ผู้ใช้ทั้งหมด พร้อม groupId ที่ assign ไว้
router.get('/', async (req, res) => {
  try {
    const users = await Admin.findAll({
      attributes: ['id', 'username', 'role', 'lineUserId', 'createdAt'],
      include: [{ model: AdminGroup, as: 'groupAccess', attributes: ['groupId'] }],
      order: [['createdAt', 'ASC']],
    });
    const result = users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      lineUserId: u.lineUserId,
      createdAt: u.createdAt,
      groupIds: u.groupAccess.map((g) => g.groupId),
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users — สร้าง user ใหม่ (admin กรอกให้)
router.post('/', async (req, res) => {
  try {
    const { username, password, role = 'user', lineUserId } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'ต้องระบุ username และ password' });
    const existing = await Admin.findOne({ where: { username } });
    if (existing) return res.status(400).json({ error: 'Username นี้มีอยู่แล้ว' });
    const user = await Admin.create({ username, password, role, lineUserId: lineUserId || null });
    await autoAssignGroupsFromLineHistory(user.id, user.lineUserId);
    const groupAccess = await AdminGroup.findAll({ where: { adminId: user.id }, attributes: ['groupId'] });
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      lineUserId: user.lineUserId,
      groupIds: groupAccess.map((g) => g.groupId),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id — แก้ lineUserId ให้ user ที่มีอยู่แล้ว
router.patch('/:id', async (req, res) => {
  try {
    const { lineUserId } = req.body;
    const user = await Admin.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    user.lineUserId = lineUserId || null;
    await user.save();
    await autoAssignGroupsFromLineHistory(user.id, user.lineUserId);
    const groupAccess = await AdminGroup.findAll({ where: { adminId: user.id }, attributes: ['groupId'] });
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      lineUserId: user.lineUserId,
      groupIds: groupAccess.map((g) => g.groupId),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id/role — เปลี่ยน role ผู้ใช้ (เฉพาะ superuser เรียกได้ — ป้องกันการเลื่อนสิทธิ์ตัวเอง/คนอื่นโดยพลการ)
router.patch('/:id/role', requireSuperuser, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin', 'superuser'].includes(role)) {
      return res.status(400).json({ error: 'role ต้องเป็น user, admin หรือ superuser' });
    }
    if (req.params.id === req.admin.id) return res.status(400).json({ error: 'เปลี่ยน role ตัวเองไม่ได้' });
    const user = await Admin.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    user.role = role;
    await user.save();
    res.json({ id: user.id, username: user.username, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id — ลบ user
router.delete('/:id', async (req, res) => {
  try {
    if (req.params.id === req.admin.id) return res.status(400).json({ error: 'ลบตัวเองไม่ได้' });
    await AdminGroup.destroy({ where: { adminId: req.params.id } });
    await Admin.destroy({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/groups — assign กลุ่มให้ user
router.post('/:id/groups', async (req, res) => {
  try {
    const { groupId } = req.body;
    await AdminGroup.findOrCreate({ where: { adminId: req.params.id, groupId } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id/groups/:groupId — เอากลุ่มออกจาก user
router.delete('/:id/groups/:groupId', async (req, res) => {
  try {
    await AdminGroup.destroy({ where: { adminId: req.params.id, groupId: req.params.groupId } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
