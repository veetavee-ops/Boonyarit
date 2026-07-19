const express = require('express');
const router = express.Router();
const { Message, Group, User, AdminGroup } = require('../models/index');
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const authMiddleware = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');

router.use(authMiddleware);

async function getAllowedGroupIds(adminId) {
  const rows = await AdminGroup.findAll({ where: { adminId }, attributes: ['groupId'] });
  return rows.map((r) => r.groupId);
}

// GET /api/groups — returns ALL groups/private chats (no date filter)
router.get('/', async (req, res) => {
  try {

    // Fetch ALL group chats (any group that ever had a message)
    let groupChats = [];
    try {
      const groupMessages = await Message.findAll({
        where: {
          groupId: { [Op.ne]: null, [Op.ne]: '' },
        },
        attributes: [
          'groupId',
          [sequelize.fn('MAX', sequelize.col('timestamp')), 'lastMessageTime'],
        ],
        include: [{ model: Group, as: 'group', attributes: ['groupName', 'pictureUrl', 'isPaymentVerifyGroup', 'isReceiptSummaryGroup', 'isLedgerBalanceGroup', 'ledgerReferenceName'] }],
        group: ['Message.groupId', 'group.groupId', 'group.isPaymentVerifyGroup', 'group.isReceiptSummaryGroup', 'group.isLedgerBalanceGroup', 'group.ledgerReferenceName'],
        order: [[sequelize.fn('MAX', sequelize.col('timestamp')), 'DESC']],
      });

      groupChats = groupMessages.map((m) => ({
        groupId: m.groupId,
        groupName: m.group?.groupName || 'Unknown Group',
        pictureUrl: m.group?.pictureUrl,
        isPrivate: false,
        lastMessageTime: m.dataValues.lastMessageTime,
        isPaymentVerifyGroup: m.group?.isPaymentVerifyGroup || false,
        isReceiptSummaryGroup: m.group?.isReceiptSummaryGroup || false,
        isLedgerBalanceGroup: m.group?.isLedgerBalanceGroup || false,
        ledgerReferenceName: m.group?.ledgerReferenceName || null,
      }));
    } catch (error) {
      console.error('[ERROR] Fetching group chats:', error.message);
    }

    // Fetch private chats (groupId IS NULL, group by userId)
    let privateChats = [];
    try {
      const privateMessages = await Message.findAll({
        where: { groupId: null },
        attributes: [
          'userId',
          [sequelize.fn('MAX', sequelize.col('Message.timestamp')), 'lastMessageTime'],
        ],
        include: [{ model: User, as: 'user', attributes: ['displayName', 'pictureUrl'] }],
        group: ['Message.userId', 'user.userId'],
        order: [[sequelize.fn('MAX', sequelize.col('Message.timestamp')), 'DESC']],
      });

      privateChats = privateMessages.map((m) => ({
        groupId: `private_${m.userId}`,
        groupName: m.user?.displayName || 'Unknown',
        pictureUrl: m.user?.pictureUrl,
        isPrivate: true,
        userId: m.userId,
        lastMessageTime: m.dataValues.lastMessageTime,
      }));
    } catch (error) {
      console.error('[ERROR] Fetching private chats:', error.message);
    }

    if (req.admin.role === 'user') {
      const allowed = await getAllowedGroupIds(req.admin.id);
      groupChats = groupChats.filter((g) => allowed.includes(g.groupId));
      privateChats = privateChats.filter((g) => allowed.includes(g.groupId));
    }

    res.json([...groupChats, ...privateChats]);
  } catch (error) {
    console.error('[ERROR] GET /api/groups:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/groups/drive-root — returns the Google Drive root folder URL
router.get('/drive-root', (_req, res) => {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) return res.json({ url: null });
    res.json({ url: `https://drive.google.com/drive/folders/${folderId}` });
});

// GET /api/groups/active?date=YYYY-MM-DD  (or date=all with rangeValue/rangeUnit)
// Returns groups that have messages in the specified date/range
router.get('/active', async (req, res) => {
  try {
    const { date, rangeValue, rangeUnit } = req.query;

    let whereClause = { groupId: { [Op.ne]: null, [Op.ne]: '' } };

    if (date && date !== 'all') {
      // +07:00 ไม่ใช่ Z — date เป็นวันที่ปฏิทินแบบไทย (Asia/Bangkok) ถ้าตีเป็น UTC midnight ตรงๆ
      // ขอบเขตจะเลื่อนไป 7 ชม. (พลาดข้อความ 00:00-06:59 ของวันนั้นตามเวลาไทย)
      const start = new Date(date + 'T00:00:00.000+07:00');
      const end = new Date(date + 'T23:59:59.999+07:00');
      whereClause.timestamp = { [Op.between]: [start, end] };
    } else if (rangeValue && rangeUnit) {
      const cutoff = new Date();
      if (rangeUnit === 'day') cutoff.setDate(cutoff.getDate() - parseInt(rangeValue));
      if (rangeUnit === 'month') cutoff.setMonth(cutoff.getMonth() - parseInt(rangeValue));
      if (rangeUnit === 'year') cutoff.setFullYear(cutoff.getFullYear() - parseInt(rangeValue));
      whereClause.timestamp = { [Op.gte]: cutoff };
    }

    const groupMessages = await Message.findAll({
      where: whereClause,
      attributes: ['groupId'],
      include: [{ model: Group, as: 'group', attributes: ['groupName', 'pictureUrl'] }],
      group: ['Message.groupId', 'group.groupId'],
    });

    let activeGroups = groupMessages.map((m) => ({
      groupId: m.groupId,
      groupName: m.group?.groupName || 'Unknown Group',
      pictureUrl: m.group?.pictureUrl,
    }));

    if (req.admin.role === 'user') {
      const allowed = await getAllowedGroupIds(req.admin.id);
      activeGroups = activeGroups.filter((g) => allowed.includes(g.groupId));
    }

    res.json(activeGroups);
  } catch (error) {
    console.error('[ERROR] GET /api/groups/active:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/groups/stats — dashboard overview: per-group message counts
router.get('/stats', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [groupMessages, todayCounts, weekCounts] = await Promise.all([
      Message.findAll({
        where: { groupId: { [Op.ne]: null, [Op.ne]: '' } },
        attributes: [
          'groupId',
          [sequelize.fn('MAX', sequelize.col('Message.timestamp')), 'lastMessageTime'],
        ],
        include: [{ model: Group, as: 'group', attributes: ['groupName', 'pictureUrl'] }],
        group: ['Message.groupId', 'group.groupId'],
        order: [[sequelize.fn('MAX', sequelize.col('Message.timestamp')), 'DESC']],
      }),
      Message.findAll({
        where: {
          groupId: { [Op.ne]: null, [Op.ne]: '' },
          timestamp: { [Op.gte]: todayStart },
        },
        attributes: ['groupId', [sequelize.fn('COUNT', sequelize.col('Message.id')), 'count']],
        group: ['groupId'],
        raw: true,
      }),
      Message.findAll({
        where: {
          groupId: { [Op.ne]: null, [Op.ne]: '' },
          timestamp: { [Op.gte]: sevenDaysAgo },
        },
        attributes: ['groupId', [sequelize.fn('COUNT', sequelize.col('Message.id')), 'count']],
        group: ['groupId'],
        raw: true,
      }),
    ]);

    const todayMap = {};
    todayCounts.forEach((r) => { todayMap[r.groupId] = parseInt(r.count, 10); });
    const weekMap = {};
    weekCounts.forEach((r) => { weekMap[r.groupId] = parseInt(r.count, 10); });

    let groups = groupMessages.map((m) => ({
      groupId: m.groupId,
      groupName: m.group?.groupName || 'Unknown Group',
      pictureUrl: m.group?.pictureUrl,
      lastMessageTime: m.dataValues.lastMessageTime,
      todayCount: todayMap[m.groupId] || 0,
      weekCount: weekMap[m.groupId] || 0,
    }));

    if (req.admin.role === 'user') {
      const allowed = await getAllowedGroupIds(req.admin.id);
      groups = groups.filter((g) => allowed.includes(g.groupId));
    }

    const todayMessages = groups.reduce((a, g) => a + g.todayCount, 0);
    const weekMessages = groups.reduce((a, g) => a + g.weekCount, 0);

    res.json({ totalGroups: groups.length, todayMessages, weekMessages, groups });
  } catch (error) {
    console.error('[ERROR] GET /api/groups/stats:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/groups/:groupId/flags — เปิด/ปิด "ธง" ต่อกลุ่ม (รวมทุกฟีเจอร์แบบ per-group toggle ไว้ endpoint เดียว)
// body: { field, value } — field ต้องอยู่ใน whitelist เท่านั้น กัน mass-assignment ไปคอลัมน์อื่นของ Group
// เพิ่มฟีเจอร์ใหม่ในอนาคต = เพิ่มคอลัมน์ boolean ใน Group model แล้วเติมชื่อ field ในนี้บรรทัดเดียว (คู่กับ
// GROUP_FLAGS ฝั่ง frontend ใน AdminPanel.jsx) เฉพาะ role admin เท่านั้น (เหมือนหน้า Dashboard ตรวจสอบเงิน)
const ALLOWED_GROUP_FLAG_FIELDS = ['isPaymentVerifyGroup', 'isReceiptSummaryGroup', 'isLedgerBalanceGroup'];
// ฟิลด์ข้อความ (ไม่ใช่ boolean) ที่แก้ผ่าน endpoint เดียวกันนี้ได้ — ต้องแยกจาก ALLOWED_GROUP_FLAG_FIELDS
// ด้านบนเพราะ logic เดิมบังคับ !!value เป็น boolean เสมอ ถ้าใช้กับฟิลด์นี้ค่า string จะถูกบีบเป็น true/false
const ALLOWED_GROUP_TEXT_FIELDS = ['ledgerReferenceName'];

router.patch('/:groupId/flags', requireAdmin, async (req, res) => {
  try {
    const { field, value } = req.body;
    const isBooleanField = ALLOWED_GROUP_FLAG_FIELDS.includes(field);
    const isTextField = ALLOWED_GROUP_TEXT_FIELDS.includes(field);
    if (!isBooleanField && !isTextField) {
      return res.status(400).json({ error: 'ฟิลด์นี้ไม่ได้รับอนุญาตให้แก้ผ่าน endpoint นี้' });
    }
    const group = await Group.findByPk(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'ไม่พบกลุ่ม' });

    const newValue = isTextField ? (String(value || '').trim() || null) : !!value;
    await group.update({ [field]: newValue });
    res.json({ groupId: group.groupId, [field]: group[field] });
  } catch (error) {
    console.error('[ERROR] PATCH /api/groups/:groupId/flags:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;