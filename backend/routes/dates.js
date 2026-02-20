const express = require('express');
const router = express.Router();
const sequelize = require('../config/database');

// GET /api/dates
router.get('/', async (req, res) => {
  try {
    const [results] = await sequelize.query(`
      SELECT DISTINCT DATE(timestamp) as date_val
      FROM "messages"
      ORDER BY date_val DESC
    `);

    const dates = results.map((r) => {
      const d = new Date(r.date_val || r.DATE_VAL || r.date);
      return d.toISOString().split('T')[0];
    });

    res.json(dates);
  } catch (error) {
    console.error('[ERROR] GET /api/dates:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;