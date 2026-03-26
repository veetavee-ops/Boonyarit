/**
 * cleanupService.js
 * Nightly cron: delete messages with expired GCS URLs + old local media files.
 */
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');

const MEDIA_DIRS = [
    path.join(__dirname, '..', 'media', 'images'),
    path.join(__dirname, '..', 'media', 'videos'),
    path.join(__dirname, '..', 'media', 'audios'),
    path.join(__dirname, '..', 'media', 'files'),
];

const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function cleanupOldFiles() {
    const now = Date.now();
    let deleted = 0;

    for (const dir of MEDIA_DIRS) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            try {
                const stat = fs.statSync(filePath);
                if (now - stat.mtimeMs > MAX_AGE_MS) {
                    fs.unlinkSync(filePath);
                    deleted++;
                }
            } catch (e) {
                console.error(`[Cleanup] Error deleting ${filePath}:`, e.message);
            }
        }
    }

    if (deleted > 0) console.log(`[Cleanup] Deleted ${deleted} local files older than 90 days`);
}

/**
 * ลบ messages ที่ gcsUrlExpires หมดอายุแล้ว
 * (ด้วย expiry 2099 จะไม่ trigger จนกว่าจะเปลี่ยน service account)
 */
async function cleanupExpiredMessages() {
    try {
        const { Message } = require('../models/index');
        const { deleteFromGCS } = require('./gcsService');

        const expired = await Message.findAll({
            where: {
                [Op.and]: [
                    { 'metadata.gcsUrlExpires': { [Op.ne]: null } },
                    { 'metadata.gcsUrlExpires': { [Op.lt]: new Date().toISOString() } },
                ]
            }
        });

        if (expired.length === 0) return;

        for (const msg of expired) {
            const paths = msg.metadata?.gcsPaths || (msg.metadata?.gcsPath ? [msg.metadata.gcsPath] : []);
            for (const p of paths) {
                await deleteFromGCS(p).catch(() => {});
            }
            await msg.destroy();
        }

        console.log(`[Cleanup] Deleted ${expired.length} messages with expired GCS URLs`);
    } catch (e) {
        console.error('[Cleanup] Error cleaning expired messages:', e.message);
    }
}

/**
 * Start nightly cleanup cron (runs at 2:00 AM every day).
 * Call this function once from server.js on startup.
 */
function startCleanupCron() {
    cleanupOldFiles();
    cleanupExpiredMessages();

    const now = new Date();
    const next2AM = new Date(now);
    next2AM.setHours(2, 0, 0, 0);
    if (next2AM <= now) next2AM.setDate(next2AM.getDate() + 1);

    const msUntilNext2AM = next2AM - now;

    setTimeout(() => {
        cleanupOldFiles();
        cleanupExpiredMessages();
        setInterval(() => {
            cleanupOldFiles();
            cleanupExpiredMessages();
        }, 24 * 60 * 60 * 1000);
    }, msUntilNext2AM);

    console.log(`[Cleanup] Cron scheduled. Next run at ${next2AM.toLocaleString('th-TH')}`);
}

module.exports = { startCleanupCron };
