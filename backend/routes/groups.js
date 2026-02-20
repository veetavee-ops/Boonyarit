const express = require('express');
const router = express.Router();
const { Message, Group } = require('../models/index');
const sequelize = require('../config/database');
const { Op } = require('sequelize');

// GET /api/groups?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'date parameter is required' });
    }

    const start = new Date(date + 'T00:00:00.000Z');
    const end = new Date(date + 'T23:59:59.999Z');

    console.log(`[API] Fetching groups for date: ${date}`);

    // Fetch private chats
    let privateChats = [];
    try {
      privateChats = await sequelize.query(`
        SELECT DISTINCT
          CONCAT('private_', m."userId") as "groupId",
          u."displayName" as "groupName",
          u."pictureUrl",
          TRUE as "isPrivate",
          MAX(m.timestamp) as "lastMessageTime"
        FROM messages m
        INNER JOIN "Users" u ON u."userId" = m."userId"
        WHERE (m."groupId" IS NULL OR m."groupId" = '') AND m.timestamp BETWEEN :start AND :end
        GROUP BY m."userId", u."displayName", u."pictureUrl"
        ORDER BY "lastMessageTime" DESC
      `, {
        replacements: { start, end },
        type: sequelize.QueryTypes.SELECT,
      });
    } catch (error) {
      console.error('[ERROR] Fetching private chats:', error.message);
    }

    // Fetch group chats
    let groupChats = [];
    try {
      const groupMessages = await Message.findAll({
        where: {
          groupId: { [Op.ne]: null, [Op.ne]: '' },
          timestamp: { [Op.between]: [start, end] },
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

    res.json([...privateChats, ...groupChats]);
  } catch (error) {
    console.error('[ERROR] GET /api/groups:', error);
    res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

module.exports = router;