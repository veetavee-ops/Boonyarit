const { Op, literal } = require('sequelize');
const { Message, User, Group, Setting } = require('../models/index');
const { summarizeAllChatsForDate } = require('./aiService');

// คำสั่งค้นหาไฟล์ — ตั้งค่าได้เองในหน้า admin panel (ไม่ต้อง hardcode/แก้โค้ด)
async function getSearchKeyword() {
    const s = await Setting.findByPk('search_keyword');
    return (s?.value || 'ค้นหา').trim();
}

// คำสั่งให้ AI สรุปแชท — ตั้งค่าได้เองในหน้า admin panel เหมือนกัน
async function getSummarizeKeyword() {
    const s = await Setting.findByPk('summarize_keyword');
    return (s?.value || 'สรุปเลย').trim();
}

// escape อักขระพิเศษของ regex กันคำที่ตั้งเองมีอักขระที่ regex ตีความผิด
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// เช็คว่าข้อความเป็นคำสั่งสรุปไหม คืน { isMatch, daysBack } — daysBack = null คือสรุปวันนี้
function matchSummarizeCommand(text, keyword) {
    const pattern = new RegExp(`^${escapeRegex(keyword)}\\s*(?:(\\d+)\\s*วัน)?\\s*$`, 'u');
    const match = (text || '').trim().match(pattern);
    if (!match) return { isMatch: false, daysBack: null };
    return { isMatch: true, daysBack: match[1] ? parseInt(match[1], 10) : null };
}

// ค้นหาไฟล์ตามชื่อ — scopeWhere: object เพิ่มเข้า where เพื่อจำกัดขอบเขต เช่น
// { groupId } = กลุ่มเดียว, { groupId: { [Op.in]: groupIds } } = หลายกลุ่ม,
// { userId, groupId: null } = DM เดียว, {} = ไม่จำกัด (ค้นหาทั้งระบบ)
async function buildSearchReply(keyword, scopeWhere = {}, scopeLabel = '') {
    const safeKeyword = keyword.replace(/'/g, "''");

    const where = {
        messageType: 'file',
        [Op.and]: [literal(`(metadata->>'fileName') ILIKE '%${safeKeyword}%'`)],
        ...scopeWhere,
    };

    const results = await Message.findAll({
        where,
        include: [
            { model: User, as: 'user', attributes: ['displayName'] },
            { model: Group, as: 'group', attributes: ['groupName'] },
        ],
        order: [['timestamp', 'DESC']],
        limit: 5,
    });

    const scopeSuffix = scopeLabel ? ` (${scopeLabel})` : '';

    if (results.length === 0) {
        return `🔍 ไม่พบไฟล์ที่ชื่อมี "${keyword}"${scopeSuffix}\n\nลองคำค้นอื่นดูครับ`;
    }

    let reply = `🔍 ค้นหา: "${keyword}" — พบ ${results.length} รายการ${scopeSuffix}\n\n`;
    results.forEach((msg, i) => {
        const meta = msg.metadata || {};
        const fileName = meta.fileName || '(ไม่ทราบชื่อ)';
        const groupName = msg.group?.groupName || '?';
        const sender = msg.user?.displayName || '?';
        const date = new Date(msg.timestamp).toLocaleDateString('th-TH', {
            day: 'numeric', month: 'short', year: 'numeric',
        });
        const baseUrl = process.env.BASE_URL || 'https://boonyarit.achalee.com';
        const link = meta.driveFileId
            ? `https://drive.google.com/file/d/${meta.driveFileId}/view`
            : meta.gcsPath
                ? `${baseUrl}/api/media?path=${encodeURIComponent(meta.gcsPath)}`
                : '(ไม่มีลิงก์)';

        reply += `${i + 1}. ${fileName}\n   📂 ${groupName}  👤 ${sender}\n   📅 ${date}\n   🔗 ${link}\n\n`;
    });

    return reply.trim();
}

// สรุปแชท — scopeWhere: เหมือน buildSearchReply ({} = ไม่จำกัด, { groupId } = กลุ่มเดียว,
// { groupId: { [Op.in]: groupIds } } = หลายกลุ่ม, { userId, groupId: null } = DM เดียว)
// daysBack: null = วันนี้วันเดียว, ตัวเลข = ย้อนหลังกี่วัน
async function buildSummarizeReply(daysBack, scopeWhere = {}, scopeLabel = '') {
    const bkkNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const todayStr = bkkNow.toISOString().slice(0, 10);

    let where;
    if (daysBack && daysBack > 0) {
        const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
        where = { timestamp: { [Op.gte]: cutoff } };
    } else {
        const start = new Date(todayStr + 'T00:00:00.000Z');
        const end = new Date(todayStr + 'T23:59:59.999Z');
        where = { timestamp: { [Op.between]: [start, end] } };
    }
    where = { ...where, ...scopeWhere };

    const messages = await Message.findAll({
        where,
        include: [
            { model: User, as: 'user', attributes: ['displayName'] },
            { model: Group, as: 'group', attributes: ['groupName'] },
        ],
        order: [['timestamp', 'ASC']],
        limit: 2000,
    });

    const rangeLabel = daysBack ? `ย้อนหลัง ${daysBack} วัน` : 'วันนี้';
    const scopeSuffix = scopeLabel ? ` (${scopeLabel})` : '';
    if (messages.length === 0) {
        return `📋 ${rangeLabel}ยังไม่มีข้อความให้สรุปครับ${scopeSuffix}`;
    }

    const result = await summarizeAllChatsForDate(messages, 'groq');
    return `📋 สรุปแชท${rangeLabel} (${result.messageCount} ข้อความ)${scopeSuffix}\n\n${result.summary}`;
}

module.exports = {
    getSearchKeyword,
    getSummarizeKeyword,
    escapeRegex,
    matchSummarizeCommand,
    buildSearchReply,
    buildSummarizeReply,
};
