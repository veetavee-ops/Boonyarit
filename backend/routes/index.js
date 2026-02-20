const router = require('express').Router();

router.use('/webhook', require('./webhook'));
router.use('/api/auth', require('./auth'));
router.use('/api/groups', require('./groups'));
router.use('/api/messages', require('./messages'));
router.use('/api/attachments', require('./attachments'));
router.use('/api', require('./admin'));

module.exports = router;