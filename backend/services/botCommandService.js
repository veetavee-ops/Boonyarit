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

// ตัดพรีวิวข้อความยาวๆ ให้เหลือช่วงที่ "ล้อมรอบคำค้น" แทนที่จะตัดจากต้นข้อความเสมอ (ไม่งั้นถ้าคำค้น
// อยู่ลึกในข้อความยาวๆ พรีวิวจะไม่โชว์คำค้นเลย)
function buildPreviewSnippet(text, keyword, maxLen = 150) {
    const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
    if (idx === -1) {
        return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
    }
    const halfWindow = Math.floor((maxLen - keyword.length) / 2);
    const start = Math.max(0, idx - halfWindow);
    const end = Math.min(text.length, idx + keyword.length + halfWindow);
    let snippet = text.slice(start, end);
    if (start > 0) snippet = `…${snippet}`;
    if (end < text.length) snippet = `${snippet}…`;
    return snippet;
}

// ครอบคำค้นที่เจอด้วย **...** — frontend (linkifyText ใน ChatWindow.jsx) แปลงเป็น <mark> ไฮไลต์สีให้
// ต้องเปลี่ยน "*" ที่อาจมีอยู่แล้วจริงในข้อความของ user เป็นตัวเต็มความกว้าง (fullwidth ＊) ก่อนเสมอ
// ไม่งั้นชนกับ delimiter ของเราเอง — เจอเคสจริง: user พิมพ์ "***..." ปนมาในข้อความ พอเราครอบ ** ทับ
// keyword ที่อยู่ใกล้กัน ทำให้จำนวน "**" ไม่ครบคู่ การจับคู่ฝั่ง frontend เพี้ยนกลืนข้อความ/ลิงก์ที่ตาม
// มาทั้งหมดเข้าไปเป็นไฮไลต์เดียว (ลิงก์กดไม่ได้ + ไฮไลต์เลอะทั้งข้อความ)
function wrapHighlight(text, keyword) {
    const safe = text.replace(/\*/g, '＊');
    if (!keyword) return safe;
    return safe.replace(new RegExp(escapeRegex(keyword), 'gi'), (match) => `**${match}**`);
}

// ค้นหาทั้งชื่อไฟล์และเนื้อหาข้อความ — scopeWhere: object เพิ่มเข้า where เพื่อจำกัดขอบเขต เช่น
// { groupId } = กลุ่มเดียว, { groupId: { [Op.in]: groupIds } } = หลายกลุ่ม,
// { userId, groupId: null } = DM เดียว, {} = ไม่จำกัด (ค้นหาทั้งระบบ)
async function buildSearchReply(keyword, scopeWhere = {}, scopeLabel = '') {
    const safeKeyword = keyword.replace(/'/g, "''");

    const where = {
        ...scopeWhere,
        [Op.or]: [
            { messageType: 'file', [Op.and]: [literal(`(metadata->>'fileName') ILIKE '%${safeKeyword}%'`)] },
            { messageType: 'text', text: { [Op.iLike]: `%${keyword}%` } },
        ],
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
        return `🔍 ไม่พบไฟล์หรือข้อความที่มี "${keyword}"${scopeSuffix}\n\nลองคำค้นอื่นดูครับ`;
    }

    let reply = `🔍 ค้นหา: "${keyword}" — พบ ${results.length} รายการ${scopeSuffix}\n\n`;
    results.forEach((msg, i) => {
        const groupName = msg.group?.groupName || (msg.groupId ? '?' : 'DM');
        const sender = msg.user?.displayName || '?';
        const date = new Date(msg.timestamp).toLocaleDateString('th-TH', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        const baseUrl = process.env.BASE_URL || 'https://boonyarit.achalee.com';
        const roomId = msg.groupId || `private_${msg.userId}`;

        // ลิงก์ตรงชื่อกลุ่ม — path "/app-jump-direct" ที่ frontend ดักไว้พาเข้าห้องแชทจริงทันที
        // (ไม่ผ่าน popup) ต่างจากลิงก์ "🔗" ด้านล่างของผลข้อความที่เปิดดูตัวอย่างใน popup ก่อน
        // แนบ &highlight= ไปด้วยเสมอ — frontend ใช้ไฮไลต์คำค้นที่ตัวข้อความจริงในห้องแชท (ไม่ใช่แค่
        // ในพรีวิวของบับเบิลผลค้นหา)
        const highlightParam = `&highlight=${encodeURIComponent(keyword)}`;
        const directLink = `${baseUrl}/app-jump-direct?groupId=${encodeURIComponent(roomId)}&messageId=${msg.id}${highlightParam}`;
        const roomLine = `📂 [${groupName}](${directLink})  👤 ${sender}`;

        if (msg.messageType === 'file') {
            const meta = msg.metadata || {};
            const fileName = wrapHighlight(meta.fileName || '(ไม่ทราบชื่อ)', keyword);
            const fileLink = meta.driveFileId
                ? `https://drive.google.com/file/d/${meta.driveFileId}/view`
                : meta.gcsPath
                    ? `${baseUrl}/api/media?path=${encodeURIComponent(meta.gcsPath)}`
                    : null;
            const linkLine = fileLink ? `🔗 [เปิดไฟล์](${fileLink})` : '🔗 (ไม่มีลิงก์)';

            reply += `${i + 1}. 📎 ${fileName}\n   ${roomLine}\n   📅 ${date}\n   ${linkLine}\n\n`;
        } else {
            const preview = wrapHighlight(buildPreviewSnippet(msg.text || '', keyword, 150), keyword);
            // ลิงก์นี้ไม่ได้เปิดหน้าเว็บจริง — frontend ดักจับ path "/app-jump" เอง แล้วเปิด popup
            // แสดงข้อความนี้ในบริบทห้องเดิม (ดู linkifyText ใน ChatWindow.jsx)
            const jumpLink = `${baseUrl}/app-jump?groupId=${encodeURIComponent(roomId)}&messageId=${msg.id}${highlightParam}`;

            reply += `${i + 1}. 💬 "${preview}"\n   ${roomLine}\n   📅 ${date}\n   🔗 [ดูตัวอย่างในป็อปอัพ](${jumpLink})\n\n`;
        }
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
        // +07:00 ไม่ใช่ Z — todayStr เป็นวันที่ปฏิทินไทย (Asia/Bangkok) ถ้าตีเป็น UTC midnight ตรงๆ
        // ขอบเขตจะเลื่อนไป 7 ชม. (พลาดข้อความ 00:00-06:59 ของวันนี้ตามเวลาไทย)
        const start = new Date(todayStr + 'T00:00:00.000+07:00');
        const end = new Date(todayStr + 'T23:59:59.999+07:00');
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
