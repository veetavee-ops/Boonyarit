const express = require('express');
const router = express.Router();
const { Message, Group, User } = require('../models/index');
const sequelize = require('../config/database');
const { Op } = require('sequelize');

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
        include: [{ model: Group, as: 'group', attributes: ['groupName', 'pictureUrl'] }],
        group: ['Message.groupId', 'group.groupId'],
        order: [[sequelize.fn('MAX', sequelize.col('timestamp')), 'DESC']],
      });

      groupChats = groupMessages.map((m) => ({
        groupId: m.groupId,
        groupName: m.group?.groupName || 'Unknown Group',
        pictureUrl: m.group?.pictureUrl,
        isPrivate: false,
        lastMessageTime: m.dataValues.lastMessageTime,
      }));
    } catch (error) {
      console.error('[ERROR] Fetching group chats:', error.message);
    }

    // res.json([...privateChats, ...groupChats]);
    res.json([...groupChats]);
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
      const start = new Date(date + 'T00:00:00.000Z');
      const end = new Date(date + 'T23:59:59.999Z');
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

    const activeGroups = groupMessages.map((m) => ({
      groupId: m.groupId,
      groupName: m.group?.groupName || 'Unknown Group',
      pictureUrl: m.group?.pictureUrl,
    }));

    res.json(activeGroups);
  } catch (error) {
    console.error('[ERROR] GET /api/groups/active:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;