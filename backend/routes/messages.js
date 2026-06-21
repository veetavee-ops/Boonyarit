const express = require('express');
const router = express.Router();
const { Message, User, Group, AdminGroup } = require('../models/index');

const { summarizeAllChatsForDate } = require('../services/aiService');
const { Op } = require('sequelize');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

async function getAllowedGroupIds(adminId) {
  const rows = await AdminGroup.findAll({ where: { adminId }, attributes: ['groupId'] });
  return rows.map((r) => r.groupId);
}

// GET /api/messages?groupId=...
// Returns ALL messages for the selected group/private chat (no date filter)
router.get('/', async (req, res) => {
  try {
    const { groupId, limit = 50, before } = req.query;

    if (!groupId) {
      return res.status(400).json({ error: 'groupId is required' });
    }

    const where = {};

    if (groupId.startsWith('private_name_')) {
      // New format: find ALL users with this displayName, merge their messages
      const displayName = groupId.replace('private_name_', '');
      const users = await User.findAll({ where: { displayName } });
      const userIds = users.map(u => u.userId);
      where.userId = { [Op.in]: userIds.length > 0 ? userIds : ['__none__'] };
      where.groupId = { [Op.or]: [null, ''] };
    } else if (groupId.startsWith('private_')) {
      // Legacy format: specific userId
      const userId = groupId.replace('private_', '');
      where.userId = userId;
      where.groupId = { [Op.or]: [null, ''] };
    } else {
      where.groupId = groupId;
    }

    // Pagination: fetch messages older than `before` timestamp
    if (before) {
      where.timestamp = { [Op.lt]: new Date(before) };
    }

    const messages = await Message.findAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['displayName', 'pictureUrl'] },
        { model: Group, as: 'group', attributes: ['groupName', 'pictureUrl'] },
      ],
      order: [['timestamp', 'DESC']], // Get newest first
      limit: parseInt(limit, 10),
    });

    // Reverse to return them in chronological order
    messages.reverse();

    res.json(messages);
  } catch (error) {
    console.error('[ERROR] GET /api/messages:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/messages/summarize-day
router.post('/summarize-day', async (req, res) => {
  try {
    const { date, rangeValue, rangeUnit, groupId, provider = 'groq' } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    let whereClause = {};

    if (date === 'all') {
      // Summarize ALL messages within the selected range (if provided)
      if (rangeValue && rangeUnit) {
        const unitMap = { day: 'days', month: 'months', year: 'years' };
        const pgUnit = unitMap[rangeUnit] || 'days';
        const cutoff = new Date();
        if (rangeUnit === 'day') cutoff.setDate(cutoff.getDate() - parseInt(rangeValue));
        if (rangeUnit === 'month') cutoff.setMonth(cutoff.getMonth() - parseInt(rangeValue));
        if (rangeUnit === 'year') cutoff.setFullYear(cutoff.getFullYear() - parseInt(rangeValue));
        whereClause = { timestamp: { [Op.gte]: cutoff } };
      }
      // else: no date restriction → all messages ever
    } else {
      const start = new Date(date + 'T00:00:00.000Z');
      const end = new Date(date + 'T23:59:59.999Z');
      whereClause = { timestamp: { [Op.between]: [start, end] } };
    }

    if (groupId && groupId !== 'all') {
      whereClause.groupId = groupId;
    }

    const allMessages = await Message.findAll({
      where: whereClause,
      include: [
        { model: User, as: 'user', attributes: ['displayName'] },
        { model: Group, as: 'group', attributes: ['groupName'] },
      ],
      order: [['timestamp', 'ASC']],
      limit: 2000,
    });

    if (allMessages.length === 0) {
      return res.json({ summary: 'ไม่มีข้อความในช่วงนี้', messageCount: 0, groupCount: 0 });
    }

    const result = await summarizeAllChatsForDate(allMessages, provider);
    res.json(result);
  } catch (error) {
    console.error('[ERROR] POST /api/messages/summarize-day:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/messages/drive-files
router.get('/drive-files', async (req, res) => {
  try {
    const where = { messageType: 'file' };
    if (req.query.groupId) where.groupId = req.query.groupId;

    if (req.admin.role === 'user') {
      const allowed = await getAllowedGroupIds(req.admin.id);
      where.groupId = req.query.groupId && allowed.includes(req.query.groupId)
        ? req.query.groupId
        : { [Op.in]: allowed };
    }

    const messages = await Message.findAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['displayName'] },
        { model: Group, as: 'group', attributes: ['groupName', 'groupId'] },
      ],
      order: [['timestamp', 'DESC']],
    });

    const files = messages
      .filter(m => m.metadata?.driveFileId)
      .map(m => ({
        id: m.id,
        fileName: m.metadata.fileName,
        fileSize: m.metadata.fileSize,
        driveUrl: `https://drive.google.com/file/d/${m.metadata.driveFileId}/view`,
        groupName: m.group?.groupName,
        groupId: m.groupId,
        uploadedBy: m.user?.displayName,
        timestamp: m.timestamp,
      }));

    res.json(files);
  } catch (error) {
    console.error('[ERROR] GET /api/messages/drive-files:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/messages/important?groupId=...
router.get('/important', async (req, res) => {
  try {
    const { groupId } = req.query;
    const where = { isImportant: true };

    if (groupId) {
      if (groupId.startsWith('private_name_')) {
        const displayName = groupId.replace('private_name_', '');
        const users = await User.findAll({ where: { displayName } });
        const userIds = users.map((u) => u.userId);
        where.userId = { [Op.in]: userIds.length > 0 ? userIds : ['__none__'] };
        where.groupId = { [Op.or]: [null, ''] };
      } else if (groupId.startsWith('private_')) {
        const userId = groupId.replace('private_', '');
        where.userId = userId;
        where.groupId = { [Op.or]: [null, ''] };
      } else {
        where.groupId = groupId;
      }
    }

    if (req.admin.role === 'user') {
      const allowed = await getAllowedGroupIds(req.admin.id);
      if (!groupId) {
        where.groupId = { [Op.in]: allowed.length ? allowed : ['__none__'] };
      } else if (!groupId.startsWith('private') && !allowed.includes(groupId)) {
        return res.json([]);
      }
    }

    const messages = await Message.findAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['displayName', 'pictureUrl'] },
        { model: Group, as: 'group', attributes: ['groupName', 'pictureUrl'] },
      ],
      order: [['timestamp', 'DESC']],
      limit: 200,
    });

    messages.reverse();
    res.json(messages);
  } catch (error) {
    console.error('[ERROR] GET /api/messages/important:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/messages/:messageId/important — toggle important flag
router.patch('/:messageId/important', async (req, res) => {
  try {
    const msg = await Message.findOne({ where: { messageId: req.params.messageId } });
    if (!msg) return res.status(404).json({ error: 'ไม่พบข้อความ' });

    if (req.admin.role === 'user') {
      const allowed = await getAllowedGroupIds(req.admin.id);
      if (msg.groupId && !allowed.includes(msg.groupId)) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
      }
    }

    msg.isImportant = !msg.isImportant;
    await msg.save();
    res.json({ messageId: msg.messageId, isImportant: msg.isImportant });
  } catch (error) {
    console.error('[ERROR] PATCH /api/messages/:messageId/important:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/messages/search?q=...&limit=30
// ค้นใน: text, ชื่อคนส่ง, ชื่อกลุ่ม, ชื่อไฟล์
router.get('/search', async (req, res) => {
  try {
    const { q, limit = 30 } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);

    const term = `%${q.trim()}%`;

    let groupFilter = `m."groupId" IS NOT NULL AND m."groupId" <> ''`;
    const replacements = { term, limit: parseInt(limit, 10) };

    if (req.admin.role === 'user') {
      const allowed = await getAllowedGroupIds(req.admin.id);
      groupFilter += ` AND m."groupId" = ANY(:allowedIds)`;
      replacements.allowedIds = allowed.length ? allowed : ['__none__'];
    }

    const rows = await Message.sequelize.query(
      `SELECT
         m."messageId",
         m."groupId",
         m.text,
         m.timestamp,
         m.metadata,
         g."groupName",
         g."pictureUrl",
         u."displayName"
       FROM messages m
       LEFT JOIN "Groups" g ON m."groupId" = g."groupId"
       LEFT JOIN "Users"  u ON m."userId"  = u."userId"
       WHERE ${groupFilter}
         AND (
           m.text                     ILIKE :term
           OR u."displayName"         ILIKE :term
           OR g."groupName"           ILIKE :term
           OR m.metadata->>'fileName' ILIKE :term
         )
       ORDER BY m.timestamp DESC
       LIMIT :limit`,
      { replacements, type: 'SELECT' }
    );

    res.json(rows);
  } catch (error) {
    console.error('[ERROR] GET /api/messages/search:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;