const express = require('express');
const router = express.Router();
const line = require('@line/bot-sdk');

const { Message, User, Group, MessageAttachment } = require('../models/index');
const { getProfile, client } = require('../services/lineService');

const lineConfig = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET,
};

// Image grouping configuration
const pendingImageGroups = new Map();
const IMAGE_GROUP_TIMEOUT = 5000; // 5 seconds

/**
 * LINE Webhook endpoint
 * Receives events from LINE Messaging API
 */
router.post('/', line.middleware(lineConfig), async (req, res) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 🔔 Webhook received - ${req.body.events?.length || 0} events`);

    try {
        await Promise.all(req.body.events.map(event => handleEvent(event, req.app.locals.io)));
        res.json({ status: 'ok' });
    } catch (err) {
        console.error('[ERROR] Webhook processing failed:', err);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

async function handleEvent(event, io) {
    if (event.type !== 'message') return;

    const { source, message } = event;
    const userId = source.userId;
    const groupId = source.groupId || null;
    const sourceType = source.type;

    // --- GROUP ---
    if (sourceType === 'group' && groupId) {
        try {
            let group = await Group.findByPk(groupId);
            if (!group) {
                const summary = await client.getGroupSummary(groupId);
                await Group.upsert({
                    groupId,
                    groupName: summary.groupName,
                    pictureUrl: summary.pictureUrl
                });
            }
        } catch (e) {
            console.error('❌ Group Error:', e.message);
        }
    }

    if (message.type === 'image') {
        return await handleImageMessage(event, userId, groupId, sourceType, message, io);
    } else {
        return await handleNonImageMessage(event, userId, groupId, sourceType, message, io);
    }
}

async function handleImageMessage(event, userId, groupId, sourceType, message, io) {
    const groupKey = `${userId}-${groupId || 'private'}`;

    try {
        let user = await User.findByPk(userId);
        if (!user) {
            const profile = await getProfile(event.source);
            await User.upsert({
                userId,
                displayName: profile.displayName,
                pictureUrl: profile.pictureUrl
            });
        }
    } catch (e) {
        console.error('❌ User Error (in handleImageMessage):', e.message);
        throw e;
    }

    const buffer = await downloadImageBuffer(message.id);

    const imageData = {
        lineMessageId: message.id,
        buffer,
        timestamp: new Date(event.timestamp)
    };

    if (pendingImageGroups.has(groupKey)) {
        const pending = pendingImageGroups.get(groupKey);
        pending.images.push(imageData);

        clearTimeout(pending.timer);
        pending.timer = setTimeout(() => saveImageGroup(groupKey, io), IMAGE_GROUP_TIMEOUT);

    } else {

        const newMessage = await Message.create({
            messageId: message.id,
            messageType: 'image',
            timestamp: new Date(event.timestamp),
            userId,
            groupId,
            sourceType,
            text: null,
            metadata: { imageCount: 1 }
        });

        pendingImageGroups.set(groupKey, {
            messageId: newMessage.id,
            images: [imageData],
            timer: setTimeout(() => saveImageGroup(groupKey, io), IMAGE_GROUP_TIMEOUT)
        });
    }
}

async function downloadImageBuffer(messageId) {
    const stream = await client.getMessageContent(messageId);
    const chunks = [];

    return new Promise((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

// ✅ แก้ให้ emit socket event
async function saveImageGroup(groupKey, io) {
    const pending = pendingImageGroups.get(groupKey);
    if (!pending) return;

    try {
        await Message.update(
            { metadata: { imageCount: pending.images.length } },
            { where: { id: pending.messageId } }
        );

        for (let i = 0; i < pending.images.length; i++) {
            const img = pending.images[i];
            await MessageAttachment.create({
                messageId: pending.messageId,
                sequenceNumber: i,
                fileData: img.buffer,
                fileType: 'image/jpeg',
                fileName: `${img.lineMessageId}.jpg`
            });
        }

        // ✅ ดึงข้อมูล Message เต็มพร้อม includes
        const fullMessage = await Message.findByPk(pending.messageId, {
            include: [
                { model: User, as: 'user', attributes: ['displayName', 'pictureUrl'] },
                { model: Group, as: 'group', attributes: ['groupName', 'pictureUrl'] },
                { model: MessageAttachment, as: 'attachments', attributes: ['id', 'fileName', 'fileType', 'sequenceNumber'] }
            ]
        });

        // ✅ Emit Socket Event
        const date = fullMessage.timestamp.toISOString().split('T')[0];
        const targetGroupId = fullMessage.groupId || `private_${fullMessage.userId}`;
        // ✅ Emit Socket Event (Broadcast Global)
        io.emit('new-message', fullMessage);

    } catch (err) {
        console.error('❌ บันทึก image group ล้มเหลว:', err.message);
    } finally {
        pendingImageGroups.delete(groupKey);
    }
}

// ✅ แก้ให้ emit socket event
async function handleNonImageMessage(event, userId, groupId, sourceType, message, io) {
    // ✅ ต้องบันทึก User ก่อน (ย้ายมาจาก handleEvent)
    try {
        let user = await User.findByPk(userId);
        if (!user) {
            const profile = await getProfile(event.source);
            await User.upsert({
                userId,
                displayName: profile.displayName,
                pictureUrl: profile.pictureUrl
            });
        }
    } catch (e) {
        console.error('❌ User Error (in handleNonImageMessage):', e.message);
        // ถ้าบันทึก User ไม่ได้ ก็ไม่ต้องบันทึก Message
        throw e;
    }

    let dbPayload = {
        messageId: message.id,
        messageType: message.type,
        timestamp: new Date(event.timestamp),
        userId,
        groupId,
        sourceType,
        metadata: {}
    };

    switch (message.type) {
        case 'text':
            dbPayload.text = message.text;
            break;
        case 'video':
            dbPayload.metadata = { duration: message.duration };
            break;
        case 'audio':
            dbPayload.metadata = { duration: message.duration };
            break;
        case 'file':
            dbPayload.metadata = { fileName: message.fileName, fileSize: message.fileSize };
            break;
        case 'location':
            dbPayload.metadata = {
                title: message.title,
                address: message.address,
                lat: message.latitude,
                lng: message.longitude
            };
            break;
        case 'sticker':
            dbPayload.metadata = {
                packageId: message.packageId,
                stickerId: message.stickerId,
                stickerUrl: `https://stickershop.line-scdn.net/stickershop/v1/sticker/${message.stickerId}/android/sticker.png`
            };
            break;
    }

    const newMessage = await Message.create(dbPayload);

    const fullMessage = await Message.findByPk(newMessage.id, {
        include: [
            { model: User, as: 'user', attributes: ['displayName', 'pictureUrl'] },
            { model: Group, as: 'group', attributes: ['groupName', 'pictureUrl'] }
        ]
    });

    const date = fullMessage.timestamp.toISOString().split('T')[0];
    const targetGroupId = fullMessage.groupId || `private_${fullMessage.userId}`;
    // ✅ Emit Socket Event (Broadcast Global)
    io.emit('new-message', fullMessage);

    return fullMessage;
}

module.exports = router;