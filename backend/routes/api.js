// routes/api.js
const express = require('express');
const router = express.Router();
const { Message, User, Group, MessageAttachment  } = require('../models/index'); // ดึงมาจาก index ที่เราทำไว้

// ดึงข้อความทั้งหมดพร้อมชื่อคนและชื่อกลุ่ม
router.get('/messages', async (req, res) => {
    console.log("ksdc");
    
    try {
        const data = await Message.findAll({
            include: [
                { 
                    model: User, 
                    as: 'user', 
                    attributes: ['displayName', 'pictureUrl'] 
                },
                { 
                    model: Group, 
                    as: 'group', 
                    attributes: ['groupName', 'pictureUrl'] 
                },
                { 
                    model: MessageAttachment, 
                    as: 'group', 
                    attributes: ['groupName', 'pictureUrl'] 
                }
            ],
            order: [['timestamp', 'DESC']],
            limit: 100 // ดึงแค่ 100 ข้อความล่าสุดก่อน
        });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/messages/:id/image', async (req, res) => {
    try {
        // ดึงจาก MessageAttachment ที่เก็บ fileData จริงๆ
        const attachment = await MessageAttachment.findOne({
            where: { messageId: req.params.id }
        });

        if (!attachment || !attachment.fileData) {
            return res.status(404).send('Image not found');
        }

        res.set('Content-Type', attachment.fileType || 'image/jpeg');
        res.send(attachment.fileData); // fileData คือ BLOB ที่เก็บไว้จริง
    } catch (err) {
        res.status(500).send(err.message);
    }
});

module.exports = router;