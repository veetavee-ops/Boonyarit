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
 * วัน 173: เตือน LINE push | วัน 180: ลบ GCS + messages
 * ข้าม user ที่ canSearch = true (ตั้งใจใช้งานอยู่)
 */
async function cleanupInactiveUsers() {
    const { Message } = require('../models/index');
    const { deleteFromGCS } = require('./gcsService');
    const { client } = require('./lineService');
    const sequelize = require('../config/database');

    try {
        const [warnUsers] = await sequelize.query(`
            SELECT m."userId"
            FROM messages m
            JOIN "Users" u ON u."userId" = m."userId"
            WHERE u."canSearch" = false
            GROUP BY m."userId"
            HAVING MAX(m."timestamp") >= NOW() - INTERVAL '173 days'
               AND MAX(m."timestamp") <  NOW() - INTERVAL '172 days'
        `);

        for (const { userId } of warnUsers) {
            try {
                await client.pushMessage(userId, {
                    type: 'text',
                    text: 'ไฟล์ของคุณจะถูกลบใน 7 วัน เพราะไม่มีการใช้งาน 6 เดือน\nส่งไฟล์ใหม่หรือพิมพ์ข้อความใดๆ เพื่อต่ออายุ'
                });
                console.log(`[Cleanup] Warned user ${userId} (day 173)`);
            } catch (e) {
                console.error(`[Cleanup] Cannot warn ${userId}:`, e.message);
            }
        }

        const [cleanUsers] = await sequelize.query(`
            SELECT m."userId"
            FROM messages m
            JOIN "Users" u ON u."userId" = m."userId"
            WHERE u."canSearch" = false
            GROUP BY m."userId"
            HAVING MAX(m."timestamp") < NOW() - INTERVAL '180 days'
        `);

        for (const { userId } of cleanUsers) {
            try {
                const messages = await Message.findAll({ where: { userId } });

                for (const msg of messages) {
                    const paths = msg.metadata?.gcsPaths || (msg.metadata?.gcsPath ? [msg.metadata.gcsPath] : []);
                    for (const p of paths) {
                        await deleteFromGCS(p).catch(() => {});
                    }
                }

                await Message.destroy({ where: { userId } });
                console.log(`[Cleanup] Cleaned inactive user ${userId} (${messages.length} messages)`);
            } catch (e) {
                console.error(`[Cleanup] Error cleaning user ${userId}:`, e.message);
            }
        }

        if (warnUsers.length)  console.log(`[Cleanup] Warned ${warnUsers.length} users (day 173)`);
        if (cleanUsers.length) console.log(`[Cleanup] Cleaned ${cleanUsers.length} inactive users (day 180)`);
    } catch (e) {
        console.error('[Cleanup] cleanupInactiveUsers error:', e.message);
    }
}

/**
 * Start nightly cleanup cron (runs at 2:00 AM every day).
 * Call this function once from server.js on startup.
 */
function startCleanupCron() {
    cleanupOldFiles();
    cleanupExpiredMessages();
    cleanupInactiveUsers();

    const now = new Date();
    const next2AM = new Date(now);
    next2AM.setHours(2, 0, 0, 0);
    if (next2AM <= now) next2AM.setDate(next2AM.getDate() + 1);

    const msUntilNext2AM = next2AM - now;

    setTimeout(() => {
        cleanupOldFiles();
        cleanupExpiredMessages();
        cleanupInactiveUsers();
        setInterval(() => {
            cleanupOldFiles();
            cleanupExpiredMessages();
            cleanupInactiveUsers();
        }, 24 * 60 * 60 * 1000);
    }, msUntilNext2AM);

    console.log(`[Cleanup] Cron scheduled. Next run at ${next2AM.toLocaleString('th-TH')}`);
}

module.exports = { startCleanupCron };
