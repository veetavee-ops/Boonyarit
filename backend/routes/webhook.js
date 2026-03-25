const express = require('express');
const router = express.Router();
const line = require('@line/bot-sdk');

const { Message, User, Group } = require('../models/index');
const { getProfile, client } = require('../services/lineService');
const { uploadToGCS, buildGCSPath } = require('../services/gcsService');

const lineConfig = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET,
};

// ─── Download helper ───────────────────────────────────────────────────────────
async function downloadAsBuffer(messageId) {
    const stream = await client.getMessageContent(messageId);
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

// Image grouping configuration
const pendingImageGroups = new Map();
const IMAGE_GROUP_TIMEOUT = 5000; // 5 seconds

/**
 * LINE Webhook endpoint
 */
const webhookMiddleware = process.env.NODE_ENV === 'production'
    ? line.middleware(lineConfig)
    : express.json();

router.post('/', webhookMiddleware, async (req, res) => {
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

    // --- GROUP upsert ---
    if (sourceType === 'group' && groupId) {
        try {
            const group = await Group.findByPk(groupId);
            if (!group) {
                const summary = await client.getGroupSummary(groupId);
                await Group.upsert({ groupId, groupName: summary.groupName, pictureUrl: summary.pictureUrl });
            }
        } catch (e) {
            console.error('❌ Group Error:', e.message);
        }
    }

    if (message.quotedMessageId) {
        console.log(`💬 Reply detected! quotedMessageId: ${message.quotedMessageId}, messageId: ${message.id}, type: ${message.type}`);
    }

    if (message.type === 'image') {
        return await handleImageMessage(event, userId, groupId, sourceType, message, io);
    } else {
        return await handleNonImageMessage(event, userId, groupId, sourceType, message, io);
    }
}

// ─── Image Message — grouped then uploaded to GCS ─────────────────────────────
async function handleImageMessage(event, userId, groupId, sourceType, message, io) {
    const groupKey = `${userId}-${groupId || 'private'}`;

    try {
        const user = await User.findByPk(userId);
        if (!user) {
            const profile = await getProfile(event.source);
            await User.upsert({ userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl });
        }
    } catch (e) {
        console.error('❌ User Error (in handleImageMessage):', e.message);
        throw e;
    }

    const buffer = await downloadAsBuffer(message.id);
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
            userId, groupId, sourceType,
            text: null,
            metadata: {
                imageCount: 1,
                ...(message.quotedMessageId && { quotedMessageId: message.quotedMessageId })
            }
        });
        pendingImageGroups.set(groupKey, {
            messageId: newMessage.id,
            images: [imageData],
            timer: setTimeout(() => saveImageGroup(groupKey, io), IMAGE_GROUP_TIMEOUT)
        });
    }
}

async function saveImageGroup(groupKey, io) {
    const pending = pendingImageGroups.get(groupKey);
    if (!pending) return;
    try {
        const gcsPaths = [];
        for (const img of pending.images) {
            const gcsPath = buildGCSPath(img.lineMessageId, '.jpg', 'image');
            await uploadToGCS(img.buffer, gcsPath, '.jpg');
            gcsPaths.push(gcsPath);
        }

        await Message.update(
            { metadata: { imageCount: gcsPaths.length, gcsPaths } },
            { where: { id: pending.messageId } }
        );

        const fullMessage = await Message.findByPk(pending.messageId, {
            include: [
                { model: User, as: 'user', attributes: ['displayName', 'pictureUrl'] },
                { model: Group, as: 'group', attributes: ['groupName', 'pictureUrl'] },
            ]
        });

        io.emit('new-message', fullMessage);
    } catch (err) {
        console.error('❌ บันทึก image group ล้มเหลว:', err.message);
    } finally {
        pendingImageGroups.delete(groupKey);
    }
}

// ─── Non-image messages ────────────────────────────────────────────────────────
async function handleNonImageMessage(event, userId, groupId, sourceType, message, io) {
    try {
        const user = await User.findByPk(userId);
        if (!user) {
            const profile = await getProfile(event.source);
            await User.upsert({ userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl });
        }
    } catch (e) {
        console.error('❌ User Error (in handleNonImageMessage):', e.message);
        throw e;
    }

    let dbPayload = {
        messageId: message.id,
        messageType: message.type,
        timestamp: new Date(event.timestamp),
        userId, groupId, sourceType,
        metadata: {
            ...(message.quotedMessageId && { quotedMessageId: message.quotedMessageId })
        }
    };

    switch (message.type) {
        case 'text':
            dbPayload.text = message.text;
            break;

        case 'video': {
            try {
                const buffer = await downloadAsBuffer(message.id);
                const gcsPath = buildGCSPath(message.id, '.mp4', 'video');
                await uploadToGCS(buffer, gcsPath, '.mp4');
                dbPayload.metadata = {
                    gcsPath,
                    duration: message.duration,
                    fileSize: buffer.length
                };
            } catch (e) {
                console.error('❌ Video upload fail:', e.message);
                dbPayload.metadata = { duration: message.duration };
            }
            break;
        }

        case 'audio': {
            try {
                const buffer = await downloadAsBuffer(message.id);
                const gcsPath = buildGCSPath(message.id, '.m4a', 'audio');
                await uploadToGCS(buffer, gcsPath, '.m4a');
                dbPayload.metadata = {
                    gcsPath,
                    duration: message.duration,
                    fileSize: buffer.length
                };
            } catch (e) {
                console.error('❌ Audio upload fail:', e.message);
                dbPayload.metadata = { duration: message.duration };
            }
            break;
        }

        case 'file': {
            try {
                const buffer = await downloadAsBuffer(message.id);
                const ext = '.' + (message.fileName.split('.').pop() || 'bin');
                const gcsPath = buildGCSPath(message.id, ext, 'file');
                await uploadToGCS(buffer, gcsPath, ext);
                dbPayload.metadata = {
                    gcsPath,
                    fileName: message.fileName,
                    fileSize: message.fileSize ?? buffer.length
                };
            } catch (e) {
                console.error('❌ File upload fail:', e.message);
                dbPayload.metadata = { fileName: message.fileName, fileSize: message.fileSize };
            }
            break;
        }

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

    io.emit('new-message', fullMessage);
    return fullMessage;
}

module.exports = router;
