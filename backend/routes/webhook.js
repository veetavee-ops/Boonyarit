const express = require('express');
const router = express.Router();
const line = require('@line/bot-sdk');
const { Op } = require('sequelize');

const { Message, User, Group, Setting } = require('../models/index');
const { getProfile, client } = require('../services/lineService');
const { uploadToGCS, buildGCSPath, getSignedUrlLong } = require('../services/gcsService');

const { ensureGroupFolder, uploadFileToDrive } = require('../services/driveService');
const { alertError } = require('../services/notifyService');

async function isDriveEnabled() {
    const s = await Setting.findByPk('drive_enabled');
    return s ? s.value === 'true' : true; // default เปิดอยู่
}


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


// ─── User DM: ค้นหาไฟล์ใน group ที่ user อยู่ด้วย (เฉพาะ canSearch=true) ────────
async function handleUserDMSearch(event, userId) {
    const text = (event.message?.text || '').trim();
    const replyToken = event.replyToken;
    console.log('[UserDM] search from', userId?.slice(0, 10), ':', JSON.stringify(text));

    const match = text.match(/^ค้นหา\s+(.+)/u);
    if (!match) {
        await client.replyMessage(replyToken, {
            type: 'text',
            text: '🤖 วิธีใช้งาน\n\nพิมพ์: ค้นหา <ชื่อไฟล์>\n\nตัวอย่าง:\n• ค้นหา สัญญา\n• ค้นหา .pdf\n• ค้นหา ใบเสนอราคา\n\nจะแสดงผลสูงสุด 5 รายการล่าสุด'
        }).catch(e => console.error('[UserDM] replyMessage error:', e.message));
        return;
    }

    const keyword = match[1].trim();
    const safeKeyword = keyword.replace(/'/g, "''");
    console.log('[UserDM] keyword:', keyword);

    try {
        const { literal } = require('sequelize');

        // หา groupId ที่ user นี้เคยส่งข้อความใน group (แสดงว่าเป็นสมาชิก)
        const userGroups = await Message.findAll({
            attributes: ['groupId'],
            where: { userId, sourceType: 'group', groupId: { [Op.not]: null } },
            group: ['groupId'],
            raw: true
        });
        const groupIds = userGroups.map(m => m.groupId);

        if (groupIds.length === 0) {
            await client.replyMessage(replyToken, {
                type: 'text',
                text: `🔍 ไม่พบไฟล์ที่ชื่อมี "${keyword}"\n\n(ไม่พบกลุ่มที่คุณเป็นสมาชิก)`
            }).catch(() => {});
            return;
        }

        const results = await Message.findAll({
            where: {
                messageType: 'file',
                groupId: { [Op.in]: groupIds },
                [Op.and]: [literal(`(metadata->>'fileName') ILIKE '%${safeKeyword}%'`)]
            },
            include: [
                { model: User, as: 'user', attributes: ['displayName'] },
                { model: Group, as: 'group', attributes: ['groupName'] }
            ],
            order: [['timestamp', 'DESC']],
            limit: 5
        });

        if (results.length === 0) {
            await client.replyMessage(replyToken, {
                type: 'text',
                text: `🔍 ไม่พบไฟล์ที่ชื่อมี "${keyword}"\n\nลองคำค้นอื่นดูครับ`
            }).catch(() => {});
            return;
        }

        let reply = `🔍 ค้นหา: "${keyword}" — พบ ${results.length} รายการ\n\n`;
        results.forEach((msg, i) => {
            const meta = msg.metadata || {};
            const fileName = meta.fileName || '(ไม่ทราบชื่อ)';
            const groupName = msg.group?.groupName || '?';
            const sender = msg.user?.displayName || '?';
            const date = new Date(msg.timestamp).toLocaleDateString('th-TH', {
                day: 'numeric', month: 'short', year: 'numeric'
            });
            const link = meta.gcsUrl
                || (meta.driveFileId ? `https://drive.google.com/file/d/${meta.driveFileId}/view` : '(ไม่มีลิงก์)');

            reply += `${i + 1}. ${fileName}\n   📂 ${groupName}  👤 ${sender}\n   📅 ${date}\n   🔗 ${link}\n\n`;
        });

        console.log('[UserDM] replying with', results.length, 'results');
        await client.replyMessage(replyToken, { type: 'text', text: reply.trim() }).catch(e => console.error('[UserDM] replyMessage error:', e.message));
    } catch (err) {
        console.error('[DM Search Error]', err.message);
        await client.replyMessage(replyToken, {
            type: 'text',
            text: '❌ เกิดข้อผิดพลาดในการค้นหา กรุณาลองใหม่'
        }).catch(e => console.error('[UserDM] replyMessage error:', e.message));
    }
}

async function handleEvent(event, io) {
    console.log('[Event]', event.type, event.source?.type, event.source?.userId?.slice(0, 10));
    if (event.type !== 'message') return;

    const { source, message } = event;
    const sourceType = source.type;

    const userId = source.userId;
    const groupId = source.groupId || null;

    // ── User DM: ตรวจสิทธิ์ก่อน ถ้า canSearch=true ค้นหาได้ ถ้าไม่มีสิทธิ์ → ignore ─
    if (sourceType === 'user' && message.type === 'text') {
        const lineUser = await User.findByPk(userId);
        if (lineUser?.canSearch) {
            await handleUserDMSearch(event, userId);
            return;
        }
        // ไม่มีสิทธิ์ → ignore เงียบๆ ไม่ตอบกลับ ไม่บันทึก
        return;
    }

    // --- GROUP upsert ---
    let groupName = null;
    let folderName = null;

    if (sourceType === 'group' && groupId) {
        try {
            const summary = await client.getGroupSummary(groupId);
            await Group.upsert({ groupId, groupName: summary.groupName, pictureUrl: summary.pictureUrl });
            groupName = summary.groupName;
        } catch (e) {
            console.error('❌ Group Error:', e.message);
            const group = await Group.findByPk(groupId);
            if (group) groupName = group.groupName;
        }
        if (groupName) folderName = groupName;
    } else if (sourceType === 'user') {
        try {
            let user = await User.findByPk(userId);
            if (!user) {
                const profile = await getProfile(event.source);
                await User.upsert({ userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl });
                user = { displayName: profile.displayName };
            }
            if (user?.displayName) folderName = user.displayName;
        } catch (e) {
            console.error('❌ Personal folder error:', e.message);
        }
    }

    if (folderName) {
        isDriveEnabled().then(enabled => {
            if (enabled) ensureGroupFolder(folderName).catch(e => console.error('Drive folder error:', e.message));
        });
    }


    if (message.type === 'image') {
        return await handleImageMessage(event, userId, groupId, sourceType, message, io, folderName);
    } else {
        return await handleNonImageMessage(event, userId, groupId, sourceType, message, io, folderName);
    }
}

// ─── Image Message — grouped then uploaded to GCS + Drive ─────────────────────
async function handleImageMessage(event, userId, groupId, sourceType, message, io, folderName) {
    const groupKey = `${userId}-${groupId || 'private'}`;

    let senderName = 'unknown';
    try {
        let user = await User.findByPk(userId);
        if (!user) {
            const profile = await getProfile(event.source);
            await User.upsert({ userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl });
            senderName = profile.displayName || 'unknown';
        } else {
            senderName = user.displayName || 'unknown';
        }
    } catch (e) {
        console.error('❌ User Error (in handleImageMessage):', e.message);
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
            folderName,
            senderName,
            timer: setTimeout(() => saveImageGroup(groupKey, io), IMAGE_GROUP_TIMEOUT)
        });
    }
}

async function saveImageGroup(groupKey, io) {
    const pending = pendingImageGroups.get(groupKey);
    if (!pending) return;
    try {
        const gcsPaths = [];
        const gcsUrls = [];
        const driveFileIds = [];

        // Drive folder (ถ้าเปิดใช้งาน)
        let folderId = null;
        if (pending.folderName && await isDriveEnabled()) {
            folderId = await ensureGroupFolder(pending.folderName).catch(() => null);
        }

        for (const img of pending.images) {
            const gcsPath = buildGCSPath(img.lineMessageId, '.jpg', 'image');
            await uploadToGCS(img.buffer, gcsPath, '.jpg');
            gcsPaths.push(gcsPath);
            const { url } = await getSignedUrlLong(gcsPath);
            gcsUrls.push(url);

            if (folderId) {
                try {
                    const driveFileName = buildDriveFileName(pending.senderName, img.timestamp.getTime(), `${img.lineMessageId}.jpg`);
                    const driveFileId = await uploadFileToDrive(img.buffer, driveFileName, 'image/jpeg', folderId).catch(() => null);
                    if (driveFileId) driveFileIds.push(driveFileId);
                } catch (e) {
                    console.error('❌ Image Drive fail:', e.message);
                }
            }
        }

        await Message.update(
            {
                metadata: {
                    imageCount: gcsPaths.length,
                    gcsPaths, gcsUrls, gcsUrlExpires: '2099-12-31T23:59:59Z',
                    ...(driveFileIds.length > 0 && { driveFileIds })
                }
            },
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
        console.error('❌ GCS upload failed:', err.message);
        alertError('GCS', err.message);
        // still emit message without image URL
        try {
            const fullMessage = await Message.findByPk(pending.messageId, {
                include: [
                    { model: User, as: 'user', attributes: ['displayName', 'pictureUrl'] },
                    { model: Group, as: 'group', attributes: ['groupName', 'pictureUrl'] },
                ]
            });
            if (fullMessage) io.emit('new-message', fullMessage);
        } catch (e) {}
    } finally {
        pendingImageGroups.delete(groupKey);
    }
}

// ─── Drive filename helper ─────────────────────────────────────────────────────
function buildDriveFileName(senderName, timestamp, originalFileName) {
    const d = new Date(timestamp + 7 * 60 * 60 * 1000); // UTC+7 (Bangkok)
    const date = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    const time = `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}`;
    const safeName = senderName.replace(/[\s/\\:*?"<>|]/g, '_').substring(0, 30);
    return `${safeName}_${date}_${time}_${originalFileName}`;
}

// ─── Non-image messages ────────────────────────────────────────────────────────
async function handleNonImageMessage(event, userId, groupId, sourceType, message, io, folderName) {
    let senderName = 'unknown';
    try {
        let user = await User.findByPk(userId);
        if (!user) {
            const profile = await getProfile(event.source);
            await User.upsert({ userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl });
            senderName = profile.displayName || 'unknown';
        } else {
            senderName = user.displayName || 'unknown';
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
                const { url: gcsUrl } = await getSignedUrlLong(gcsPath);
                dbPayload.metadata = {
                    gcsPath, gcsUrl, gcsUrlExpires: '2099-12-31T23:59:59Z',
                    duration: message.duration,
                    fileSize: buffer.length
                };
            } catch (e) {
                console.error('❌ Video upload fail:', e.message);
                alertError('GCS Video', e.message);
                dbPayload.metadata = { duration: message.duration };
            }
            break;
        }

        case 'audio': {
            try {
                const buffer = await downloadAsBuffer(message.id);
                const gcsPath = buildGCSPath(message.id, '.m4a', 'audio');
                await uploadToGCS(buffer, gcsPath, '.m4a');
                const { url: gcsUrl } = await getSignedUrlLong(gcsPath);
                dbPayload.metadata = {
                    gcsPath, gcsUrl, gcsUrlExpires: '2099-12-31T23:59:59Z',
                    duration: message.duration,
                    fileSize: buffer.length
                };
            } catch (e) {
                console.error('❌ Audio upload fail:', e.message);
                alertError('GCS Audio', e.message);
                dbPayload.metadata = { duration: message.duration };
            }
            break;
        }

        case 'file': {
            let buffer = null;
            try {
                buffer = await downloadAsBuffer(message.id);
            } catch (e) {
                console.error('❌ File download fail:', e.message);
                dbPayload.metadata = { fileName: message.fileName, fileSize: message.fileSize };
                break;
            }

            const ext = '.' + (message.fileName.split('.').pop() || 'bin');
            let gcsPath = null, gcsUrl = null;
            let driveFileId = null;

            // GCS upload (ล้มเหลวได้ โดยไม่กระทบ Drive)
            try {
                gcsPath = buildGCSPath(message.id, ext, 'file');
                await uploadToGCS(buffer, gcsPath, ext);
                const signed = await getSignedUrlLong(gcsPath);
                gcsUrl = signed.url;
            } catch (e) {
                console.error('❌ File GCS fail:', e.message);
                alertError('GCS File', e.message);
            }

            // Drive upload (ล้มเหลวได้ โดยไม่กระทบ DB save)
            if (folderName && await isDriveEnabled()) {
                try {
                    const folderId = await ensureGroupFolder(folderName).catch(() => null);
                    if (folderId) {
                        const driveFileName = buildDriveFileName(senderName, event.timestamp, message.fileName || `${message.id}${ext}`);
                        driveFileId = await uploadFileToDrive(buffer, driveFileName, 'application/octet-stream', folderId).catch(() => null);
                    }
                } catch (e) {
                    console.error('❌ File Drive fail:', e.message);
                }
            }

            dbPayload.metadata = {
                ...(gcsPath && { gcsPath, gcsUrl, gcsUrlExpires: '2099-12-31T23:59:59Z' }),
                fileName: message.fileName,
                fileSize: message.fileSize ?? buffer.length,
                ...(driveFileId && { driveFileId })
            };
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
