const express = require('express');
const router = express.Router();
const { Message, User, Group, MessageAttachment } = require('../models/index');
const { summarizeAllChatsForDate } = require('../services/aiService');
const { Op } = require('sequelize');

// GET /api/messages?groupId=...&date=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const { groupId, date } = req.query;

    if (!groupId || !date) {
      return res.status(400).json({ error: 'groupId and date are required' });
    }

    const start = new Date(date + 'T00:00:00.000Z');
    const end = new Date(date + 'T23:59:59.999Z');
    const where = { timestamp: { [Op.between]: [start, end] } };

    if (groupId.startsWith('private_')) {
      const userId = groupId.replace('private_', '');
      where.userId = userId;
      where.groupId = { [Op.or]: [null, ''] };
      console.log(`[API] Private messages for userId: ${userId}`);
    } else {
      where.groupId = groupId;
      console.log(`[API] Group messages for groupId: ${groupId}`);
    }

    const messages = await Message.findAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['displayName', 'pictureUrl'] },
        { model: Group, as: 'group', attributes: ['groupName', 'pictureUrl'] },
        { model: MessageAttachment, as: 'attachments', attributes: ['id', 'fileName', 'fileType'] },
      ],
      order: [['timestamp', 'ASC']],
    });

    res.json(messages);
  } catch (error) {
    console.error('[ERROR] GET /api/messages:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/messages/summarize-day
router.post('/summarize-day', async (req, res) => {
  try {
    const { date } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    const start = new Date(date + 'T00:00:00.000Z');
    const end = new Date(date + 'T23:59:59.999Z');

    const allMessages = await Message.findAll({
      where: { timestamp: { [Op.between]: [start, end] } },
      include: [
        { model: User, as: 'user', attributes: ['displayName'] },
        { model: Group, as: 'group', attributes: ['groupName'] },
      ],
      order: [['timestamp', 'ASC']],
      limit: 1000,
    });

    if (allMessages.length === 0) {
      return res.json({ summary: 'ไม่มีข้อความในวันนี้', messageCount: 0, groupCount: 0 });
    }

    const result = await summarizeAllChatsForDate(allMessages);
    res.json(result);
  } catch (error) {
    console.error('[ERROR] POST /api/messages/summarize-day:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;