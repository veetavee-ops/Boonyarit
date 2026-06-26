const express = require('express');
const router = express.Router();
const sequelize = require('../config/database');
const { User } = require('../models/index');
const authMiddleware = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');

router.use(authMiddleware, requireAdmin);

// GET /api/line-users — รายชื่อ LINE users พร้อม inactiveDays (sort มากสุดก่อน)
router.get('/', async (req, res) => {
  try {
    const [users] = await sequelize.query(`
      SELECT
        u."userId",
        u."displayName",
        u."pictureUrl",
        u."canSearch",
        u."updatedAt",
        MAX(m."timestamp") AS "lastActive",
        (EXTRACT(EPOCH FROM (NOW() - MAX(m."timestamp"))) / 86400)::int AS "inactiveDays"
      FROM "Users" u
      LEFT JOIN messages m ON m."userId" = u."userId"
      GROUP BY u."userId", u."displayName", u."pictureUrl", u."canSearch", u."updatedAt"
      ORDER BY "inactiveDays" DESC NULLS LAST
    `);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/line-users/:userId/search-permission — เปิด/ปิดสิทธิ์ค้นหา
router.patch('/:userId/search-permission', async (req, res) => {
  try {
    const { canSearch } = req.body;
    const [updated] = await User.update(
      { canSearch: !!canSearch },
      { where: { userId: req.params.userId } }
    );
    if (updated === 0) return res.status(404).json({ error: 'ไม่พบ user' });
    res.json({ ok: true, canSearch: !!canSearch });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
