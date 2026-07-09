const express = require('express');
const router = express.Router();
const line = require('@line/bot-sdk');
const { Op } = require('sequelize');

const { Message, User, Group, Setting, Admin, AdminGroup, PaymentVerification } = require('../models/index');
const { getProfile, client } = require('../services/lineService');
const { uploadToGCS, buildGCSPath } = require('../services/gcsService');

const { ensureGroupFolder, uploadFileToDrive } = require('../services/driveService');
const { alertError } = require('../services/notifyService');
const { summarizeAllChatsForDate, extractPaymentDocuments, matchPaymentItems, extractReceiptSummary } = require('../services/aiService');

// ถ้าคนส่งข้อความนี้ผูก LINE ID กับบัญชี admin ไว้ (เมนู "ตั้งค่าบัญชี")
// ให้สิทธิ์เข้าถึงกลุ่ม/DM นี้ให้อัตโนมัติทันที — ไม่ต้องรอผูก LINE ID ใหม่หรือให้ superadmin ไปติ๊กเพิ่มเอง
async function autoGrantAccessForMessage(userId, groupId, sourceType) {
    try {
        const admin = await Admin.findOne({ where: { lineUserId: userId } });
        if (!admin) return;
        const targetGroupId = sourceType === 'group' && groupId ? groupId : `private_${userId}`;
        await AdminGroup.findOrCreate({ where: { adminId: admin.id, groupId: targetGroupId } });
    } catch (e) {
        console.error('❌ Auto-grant access error:', e.message);
    }
}

async function isDriveEnabled() {
    const s = await Setting.findByPk('drive_enabled');
    return s ? s.value === 'true' : true; // default เปิดอยู่
}

// คำสั่งค้นหาไฟล์ผ่าน LINE — ตั้งค่าได้เองในหน้า admin panel (ไม่ต้อง hardcode/แก้โค้ด)
async function getSearchKeyword() {
    const s = await Setting.findByPk('search_keyword');
    return (s?.value || 'ค้นหา').trim();
}

// คำสั่งให้ AI สรุปแชทผ่าน LINE — ตั้งค่าได้เองในหน้า admin panel เหมือนกัน
// พิมพ์เดี่ยวๆ = สรุปวันนี้, พิมพ์ตามด้วยเลข+"วัน" (เช่น "สรุปเลย 2 วัน") = สรุปย้อนหลังกี่วัน
async function getSummarizeKeyword() {
    const s = await Setting.findByPk('summarize_keyword');
    return (s?.value || 'สรุปเลย').trim();
}

// คำสั่งเปิด/ปิดรวบรวมรูปบิลเพื่อสรุปด้วย AI — ตั้งค่าได้เองในหน้า admin panel เหมือนกัน
// พิมพ์คำนี้ครั้งแรก = เริ่มรวบรวมรูป, พิมพ์ซ้ำอีกครั้ง = ปิดแล้วสรุปรูปที่ส่งมาทั้งหมด
async function getReceiptSummaryKeyword() {
    const s = await Setting.findByPk('receipt_summary_keyword');
    return (s?.value || '225588').trim();
}

// เช็คว่าข้อความเป็นคำสั่งสรุปไหม คืน { isMatch, daysBack } — daysBack = null คือสรุปวันนี้
function matchSummarizeCommand(text, keyword) {
    const pattern = new RegExp(`^${escapeRegex(keyword)}\\s*(?:(\\d+)\\s*วัน)?\\s*$`, 'u');
    const match = (text || '').trim().match(pattern);
    if (!match) return { isMatch: false, daysBack: null };
    return { isMatch: true, daysBack: match[1] ? parseInt(match[1], 10) : null };
}

// escape อักขระพิเศษของ regex กันคำที่ตั้งเองมีอักขระที่ regex ตีความผิด
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

// Payment verification image pairing — คนละ buffer จาก pendingImageGroups เพราะไม่บันทึกเป็น Message ปกติ
// รอรูปครบ 2 รูปจากคนเดียวกันในกลุ่มที่ติดธง isPaymentVerifyGroup แล้วส่งเข้า AI vision ตรวจสอบ
const pendingPaymentImages = new Map();
const PAYMENT_IMAGE_TIMEOUT = 8000; // 8 วิ — ให้เวลามากกว่าปกตินิดหน่อยเพราะรอครบ 2 รูปเป๊ะ

// Receipt summary session — เปิดด้วยคำสั่ง keyword, รอรับรูป 1-10 รูป, ปิดด้วย keyword เดิมอีกครั้งแล้วสรุป
// ต่างจาก pendingPaymentImages ตรงที่ไม่มี timeout สั้นๆ อัตโนมัติ (ผู้ใช้เป็นคนสั่งปิดเอง) มีแค่ idle timeout กันลืม
const pendingReceiptSummary = new Map(); // key: `${groupId}_${userId}`
const RECEIPT_SUMMARY_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 นาที — เผื่อเวลาถ่าย/ส่งรูปหลายใบ
const MAX_RECEIPT_IMAGES = 10;

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


// คำสั่งค้นหา/สรุป ไม่ถูกบันทึกลง DB (ดู handleEvent — return ก่อนถึงจุดบันทึกข้อความ)
// แปะหมายเหตุนี้ท้าย reply ทุกครั้ง กันผู้ใช้เข้าใจผิดว่าข้อความหาย
const BOT_COMMAND_NOTICE = '\n\n─────────\n💡 คำสั่งนี้และคำตอบนี้จะไม่ถูกบันทึกในคลังแชท';

// ─── ค้นหาไฟล์ผ่าน LINE — ใช้ได้ทั้งใน DM และในกลุ่ม ─────────────────────────
// DM: ค้นหาข้ามทุกกลุ่มที่ user เป็นสมาชิก (ต้องมี canSearch หรือเป็น admin ที่ผูก LINE ID)
// กลุ่ม: ค้นหาเฉพาะไฟล์ในกลุ่มนั้นเท่านั้น (กันข้อมูลข้ามกลุ่มหลุดไปให้คนอื่นเห็นกลางกลุ่ม)
async function handleSearchCommand(event, userId, groupId, sourceType, keyword) {
    const text = (event.message?.text || '').trim();
    const replyToken = event.replyToken;
    console.log('[Search]', sourceType, 'from', userId?.slice(0, 10), ':', JSON.stringify(text));

    const pattern = new RegExp(`^${escapeRegex(keyword)}\\s+(.+)`, 'u');
    const match = text.match(pattern);
    if (!match) {
        // ในกลุ่ม ไม่ตอบ "วิธีใช้งาน" กันบอทกวนคนอื่นในกลุ่มตอนแค่มีคนพิมพ์คำใกล้เคียง
        if (sourceType === 'group') return;
        await client.replyMessage(replyToken, {
            type: 'text',
            text: `🤖 วิธีใช้งาน\n\nพิมพ์: ${keyword} <ชื่อไฟล์>\n\nตัวอย่าง:\n• ${keyword} สัญญา\n• ${keyword} .pdf\n• ${keyword} ใบเสนอราคา\n\nจะแสดงผลสูงสุด 5 รายการล่าสุด${BOT_COMMAND_NOTICE}`
        }).catch(e => console.error('[Search] replyMessage error:', e.message));
        return;
    }

    const searchKeyword = match[1].trim();
    const safeKeyword = searchKeyword.replace(/'/g, "''");
    console.log('[Search] keyword:', searchKeyword);

    try {
        const { literal } = require('sequelize');

        let groupIds;
        if (sourceType === 'group' && groupId) {
            // ในกลุ่ม — ค้นหาเฉพาะไฟล์ของกลุ่มนี้เท่านั้น
            groupIds = [groupId];
        } else {
            // DM — หา groupId ที่ user นี้เคยส่งข้อความใน group (แสดงว่าเป็นสมาชิก)
            const userGroups = await Message.findAll({
                attributes: ['groupId'],
                where: { userId, sourceType: 'group', groupId: { [Op.not]: null } },
                group: ['groupId'],
                raw: true
            });
            groupIds = userGroups.map(m => m.groupId);
        }

        if (groupIds.length === 0) {
            await client.replyMessage(replyToken, {
                type: 'text',
                text: `🔍 ไม่พบไฟล์ที่ชื่อมี "${searchKeyword}"\n\n(ไม่พบกลุ่มที่คุณเป็นสมาชิก)${BOT_COMMAND_NOTICE}`
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
                text: `🔍 ไม่พบไฟล์ที่ชื่อมี "${searchKeyword}"\n\nลองคำค้นอื่นดูครับ${BOT_COMMAND_NOTICE}`
            }).catch(() => {});
            return;
        }

        let reply = `🔍 ค้นหา: "${searchKeyword}" — พบ ${results.length} รายการ\n\n`;
        results.forEach((msg, i) => {
            const meta = msg.metadata || {};
            const fileName = meta.fileName || '(ไม่ทราบชื่อ)';
            const groupName = msg.group?.groupName || '?';
            const sender = msg.user?.displayName || '?';
            const date = new Date(msg.timestamp).toLocaleDateString('th-TH', {
                day: 'numeric', month: 'short', year: 'numeric'
            });
            const baseUrl = process.env.BASE_URL || 'https://boonyarit.achalee.com';
            const link = meta.driveFileId
                ? `https://drive.google.com/file/d/${meta.driveFileId}/view`
                : meta.gcsPath
                    ? `${baseUrl}/api/media?path=${encodeURIComponent(meta.gcsPath)}`
                    : '(ไม่มีลิงก์)';

            reply += `${i + 1}. ${fileName}\n   📂 ${groupName}  👤 ${sender}\n   📅 ${date}\n   🔗 ${link}\n\n`;
        });

        console.log('[Search] replying with', results.length, 'results');
        await client.replyMessage(replyToken, { type: 'text', text: reply.trim() + BOT_COMMAND_NOTICE }).catch(e => console.error('[Search] replyMessage error:', e.message));
    } catch (err) {
        console.error('[Search Error]', err.message);
        await client.replyMessage(replyToken, {
            type: 'text',
            text: '❌ เกิดข้อผิดพลาดในการค้นหา กรุณาลองใหม่' + BOT_COMMAND_NOTICE
        }).catch(e => console.error('[Search] replyMessage error:', e.message));
    }
}

// LINE ข้อความยาวสุด 5000 ตัวอักษร — ตัดให้พอดีกันส่งไม่ออก
const LINE_TEXT_LIMIT = 5000;
function truncateForLine(text) {
    if (text.length <= LINE_TEXT_LIMIT) return text;
    return text.slice(0, LINE_TEXT_LIMIT - 20) + '\n…(ตัดข้อความ)';
}

// ─── ให้ AI สรุปแชทผ่าน LINE — ใช้ได้ทั้งในกลุ่มและ DM ────────────────────────
// กลุ่ม: สรุปเฉพาะแชทของกลุ่มนั้น (ไม่ข้ามไปกลุ่มอื่น กันข้อมูลหลุด)
// DM: สรุปทุกกลุ่มที่คนนั้นเป็นสมาชิก (เหมือนเลือก "ทุกกลุ่ม" ในหน้าเว็บ)
// daysBack: null = วันนี้วันเดียว, ตัวเลข = ย้อนหลังกี่วัน (จากคำสั่งเช่น "สรุปเลย 2 วัน")
async function handleSummarizeCommand(event, userId, groupId, sourceType, daysBack) {
    const replyToken = event.replyToken;
    console.log('[Summarize]', sourceType, 'from', userId?.slice(0, 10), 'daysBack:', daysBack);

    try {
        // "วันนี้" ตามเวลาไทย (UTC+7) ไม่ใช่เวลา server
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

        if (sourceType === 'group' && groupId) {
            where.groupId = groupId;
        } else {
            // DM — สรุปทุกกลุ่มที่ userId นี้เคยส่งข้อความ (เป็นสมาชิกอยู่)
            const userGroups = await Message.findAll({
                attributes: ['groupId'],
                where: { userId, sourceType: 'group', groupId: { [Op.not]: null } },
                group: ['groupId'],
                raw: true,
            });
            const groupIds = userGroups.map((m) => m.groupId);
            if (groupIds.length === 0) {
                await client.replyMessage(replyToken, { type: 'text', text: '📋 ไม่พบกลุ่มที่คุณเป็นสมาชิกครับ' + BOT_COMMAND_NOTICE }).catch(() => {});
                return;
            }
            where.groupId = { [Op.in]: groupIds };
        }

        const messages = await Message.findAll({
            where,
            include: [
                { model: User, as: 'user', attributes: ['displayName'] },
                { model: Group, as: 'group', attributes: ['groupName'] },
            ],
            order: [['timestamp', 'ASC']],
            limit: 2000,
        });

        if (messages.length === 0) {
            const label = daysBack ? `ย้อนหลัง ${daysBack} วัน` : 'วันนี้';
            await client.replyMessage(replyToken, { type: 'text', text: `📋 ${label}ยังไม่มีข้อความให้สรุปครับ` + BOT_COMMAND_NOTICE }).catch(() => {});
            return;
        }

        const result = await summarizeAllChatsForDate(messages, 'groq');
        const rangeLabel = daysBack ? `ย้อนหลัง ${daysBack} วัน` : 'วันนี้';
        const reply = `📋 สรุปแชท${rangeLabel} (${result.messageCount} ข้อความ)\n\n${result.summary}`;

        await client.replyMessage(replyToken, { type: 'text', text: truncateForLine(reply) + BOT_COMMAND_NOTICE })
            .catch(e => console.error('[Summarize] replyMessage error:', e.message));
    } catch (err) {
        console.error('[Summarize Error]', err.message);
        await client.replyMessage(replyToken, {
            type: 'text',
            text: '❌ สรุปแชทไม่สำเร็จ กรุณาลองใหม่' + BOT_COMMAND_NOTICE
        }).catch(e => console.error('[Summarize] replyMessage error:', e.message));
    }
}

// ─── คำสั่ง "help" — อธิบายวัตถุประสงค์ระบบ + canSearch + cron cleanup ──────────
// ชั่วคราวสำหรับทีมงานทบทวน/ทดสอบผ่าน LINE โดยตรง — ลบออกก่อนเปิดให้ลูกค้าจริงใช้งาน
// (เนื้อหาเผยรายละเอียดภายใน เช่น canSearch/การลบข้อมูล ไม่เหมาะให้ลูกค้าทั่วไปเห็น)
async function handleHelpCommand(event) {
    const replyToken = event.replyToken;
    const text = `📖 Boonyarit คืออะไร

LINE OA ที่ทำหน้าที่ archive แชท + บอทตอบอัตโนมัติ + admin dashboard
ให้ธุรกิจที่คุยงานผ่าน LINE มีที่เก็บถาวร ค้นย้อนหลังได้ ไม่ต้องพึ่ง LINE app เดิม


🗂️ ฟีเจอร์หลัก

1) Archive — ทุกข้อความ/ไฟล์ในกลุ่มหรือ DM ที่บอทอยู่ด้วย บันทึกลง DB + ไฟล์ขึ้น GCS (backup ไป Drive) ให้ staff ดูย้อนหลังผ่าน dashboard

2) บอทค้นหาไฟล์ (Tier 1) — ลูกค้า DM ไฟล์ให้บอทเก็บ พิมพ์ "ค้นหา [คำ]" ดึงไฟล์ตัวเองกลับมาได้ จำกัด 10 ไฟล์/คน

3) ตรวจสอบการโอนเงิน (AI Vision) — ส่งรูปตั้งเบิก + สกรีนช็อตธนาคารเข้ากลุ่มที่ติดธงไว้ AI จับคู่ยอดอัตโนมัติ ตอบกลับทันที + เก็บ ledger ให้ดูใน dashboard


🔑 canSearch คืออะไร

Flag ต่อ user (ลูกค้า) ที่ admin เปิด/ปิดเองจาก admin panel
- true → ใช้คำสั่ง "ค้นหา"/"สรุปเลย" ทาง DM ได้ + ได้รับการยกเว้นจากระบบลบข้อมูลอัตโนมัติ (ถือว่าตั้งใจใช้งานจริง)
- false (default) → DM เงียบ ไม่ตอบกลับคำสั่งพวกนี้ และเข้าเงื่อนไขลบข้อมูลอัตโนมัติได้ตามปกติ

หมายเหตุ: flag เดียวทำหน้าที่ 2 อย่าง (สิทธิ์ค้นหา + ยกเว้นการลบ) ผูกกันโดยตั้งใจ


🗑️ ระบบลบข้อมูลอัตโนมัติ (cron ทุกวันตี 2)

เงื่อนไข: user ที่ canSearch=false และไม่มีข้อความใหม่เกิน 180 วัน

วัน 173 → push LINE เตือนว่าจะลบใน 7 วัน
วัน 180 → ลบจริง:
  • DB: ลบ message ทั้งหมดของ user นั้นถาวร (เก็บ user record ไว้)
  • GCS: ลบไฟล์จริงตาม gcsPath/gcsPaths ในแต่ละ message
  • Google Drive: ไม่ลบ — backup บน Drive ค้างอยู่ถาวร (ยังไม่ implement)


⚠️ ข้อความนี้เป็นคำสั่งทดสอบชั่วคราว จะถูกลบออกก่อนเปิดให้ลูกค้าจริงใช้งาน`;

    await client.replyMessage(replyToken, { type: 'text', text: truncateForLine(text) + BOT_COMMAND_NOTICE })
        .catch(e => console.error('[Help] replyMessage error:', e.message));
}

async function handleEvent(event, io) {
    console.log('[Event]', event.type, event.source?.type, event.source?.userId?.slice(0, 10));
    if (event.type !== 'message') return;

    const { source, message } = event;
    const sourceType = source.type;

    const userId = source.userId;
    const groupId = source.groupId || null;

    // DM จาก LINE account ที่ผูกกับ admin คนไหนไว้ (เมนู "ตั้งค่าบัญชี" ผูก LINE ID)
    // ให้ถือเป็นแชทปกติเสมอ — เก็บเข้าคลัง + auto-grant สิทธิ์ให้เจ้าของเห็น DM ตัวเอง
    const linkedAdmin = sourceType === 'user' ? await Admin.findOne({ where: { lineUserId: userId } }) : null;

    if (message.type === 'text') {
        // คำสั่ง "help" ชั่วคราว — เฉพาะ DM จาก admin ที่ผูก LINE ID ไว้และมี role superuser เท่านั้น
        // ไม่ทำงานในกลุ่มเลย กันลูกค้า/ทีมงานทั่วไปเห็นรายละเอียดภายในระบบ (จะลบก่อนเปิดลูกค้าจริง)
        if (sourceType === 'user' && linkedAdmin?.role === 'superuser' && /^help$/i.test((message.text || '').trim())) {
            await handleHelpCommand(event);
            return;
        }

        // คำสั่งเปิด/ปิดสรุปบิลซื้อของ (OCR) — เฉพาะกลุ่มที่ติดธง isReceiptSummaryGroup เท่านั้น
        if (sourceType === 'group' && groupId) {
            const receiptSummaryKeyword = await getReceiptSummaryKeyword();
            if ((message.text || '').trim() === receiptSummaryKeyword) {
                const group = await Group.findByPk(groupId);
                if (group?.isReceiptSummaryGroup) {
                    await handleReceiptSummaryToggle(event, userId, groupId);
                    return;
                }
            }
        }

        const searchKeyword = await getSearchKeyword();
        const isSearchCommand = new RegExp(`^${escapeRegex(searchKeyword)}\\s+`, 'u').test(message.text || '');
        const summarizeKeyword = await getSummarizeKeyword();
        const { isMatch: isSummarizeCommand, daysBack } = matchSummarizeCommand(message.text, summarizeKeyword);

        // ในกลุ่ม — ใครก็พิมพ์คำสั่งค้นหา/สรุปได้ (จำกัดแค่ข้อมูลของกลุ่มนั้น ไม่ข้ามไปกลุ่มอื่น)
        if (sourceType === 'group') {
            if (isSearchCommand) {
                await handleSearchCommand(event, userId, groupId, sourceType, searchKeyword);
                return;
            }
            if (isSummarizeCommand) {
                await handleSummarizeCommand(event, userId, groupId, sourceType, daysBack);
                return;
            }
        }

        if (sourceType === 'user') {
            // คำสั่งค้นหา/สรุป ใช้ได้เสมอถ้าเป็น admin ที่ผูก LINE ID ไว้ (ไม่ต้องพึ่ง canSearch)
            if (linkedAdmin && (isSearchCommand || isSummarizeCommand)) {
                if (isSearchCommand) await handleSearchCommand(event, userId, groupId, sourceType, searchKeyword);
                else await handleSummarizeCommand(event, userId, groupId, sourceType, daysBack);
                return;
            }

            // ── User DM (ลูกค้าทั่วไป ไม่ได้ผูกกับ admin คนไหน): ตรวจสิทธิ์ก่อน ถ้า canSearch=true ใช้คำสั่งได้ ถ้าไม่มีสิทธิ์ → ignore ─
            if (!linkedAdmin) {
                const lineUser = await User.findByPk(userId);
                if (lineUser?.canSearch) {
                    if (isSummarizeCommand) await handleSummarizeCommand(event, userId, groupId, sourceType, daysBack);
                    else await handleSearchCommand(event, userId, groupId, sourceType, searchKeyword);
                    return;
                }
                // ไม่มีสิทธิ์ → ignore เงียบๆ ไม่ตอบกลับ ไม่บันทึก
                return;
            }
            // linkedAdmin + ข้อความทั่วไป (ไม่ใช่คำสั่งค้นหา/สรุป) → ปล่อยผ่านไปบันทึกเป็นแชทปกติด้านล่าง
        }
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

    await autoGrantAccessForMessage(userId, groupId, sourceType);


    if (message.type === 'image') {
        return await handleImageMessage(event, userId, groupId, sourceType, message, io, folderName);
    } else {
        return await handleNonImageMessage(event, userId, groupId, sourceType, message, io, folderName);
    }
}

// ─── Image Message — grouped then uploaded to GCS + Drive ─────────────────────
async function handleImageMessage(event, userId, groupId, sourceType, message, io, folderName) {
    const groupKey = `${userId}-${groupId || 'private'}`;

    // กลุ่มที่ติดธง isPaymentVerifyGroup — รูปที่ส่งเข้ามาไม่บันทึกเป็นแชทปกติ
    // แต่รอครบ 2 รูปแล้วส่งให้ AI vision ตรวจสอบรายงานตั้งเบิก vs สลิปธนาคาร
    if (sourceType === 'group' && groupId) {
        const group = await Group.findByPk(groupId);
        if (group?.isPaymentVerifyGroup) {
            return await handlePaymentVerifyImage(event, userId, groupId, message, io, groupKey);
        }

        // กลุ่มที่ติดธง isReceiptSummaryGroup + user นี้เปิด session รวบรวมรูปบิลไว้อยู่ —
        // รูปที่ส่งมาไม่บันทึกเป็นแชทปกติ เก็บไว้รอคำสั่งปิดเพื่อสรุปแทน
        if (group?.isReceiptSummaryGroup) {
            const sessionKey = `${groupId}_${userId}`;
            if (pendingReceiptSummary.has(sessionKey)) {
                return await handleReceiptSummaryImage(event, sessionKey, message);
            }
        }
    }

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
        const driveFileIds = [];

        // Drive folder (ถ้าเปิดใช้งาน)
        let folderId = null;
        if (pending.folderName && await isDriveEnabled()) {
            folderId = await ensureGroupFolder(pending.folderName).catch(() => null);
        }

        for (const img of pending.images) {
            // GCS upload (ล้มเหลวได้ โดยไม่กระทบ Drive)
            try {
                const gcsPath = buildGCSPath(img.lineMessageId, '.jpg', 'image');
                await uploadToGCS(img.buffer, gcsPath, '.jpg');
                gcsPaths.push(gcsPath);
            } catch (e) {
                console.error('❌ Image GCS fail:', e.message);
                alertError('GCS Image', e.message);
            }

            // Drive upload (ล้มเหลวได้ โดยไม่กระทบ GCS)
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
                    gcsPaths,
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

// ─── Payment Verification — รอรูปครบ 2 รูปจากคนเดียวกัน แล้วส่งตรวจสอบ ──────────
async function handlePaymentVerifyImage(event, userId, groupId, message, io, groupKey) {
    const buffer = await downloadAsBuffer(message.id);
    const imageData = { lineMessageId: message.id, buffer, timestamp: new Date(event.timestamp) };
    const replyToken = event.replyToken;

    if (pendingPaymentImages.has(groupKey)) {
        const pending = pendingPaymentImages.get(groupKey);
        clearTimeout(pending.timer);
        pending.images.push(imageData);

        if (pending.images.length >= 2) {
            pendingPaymentImages.delete(groupKey);
            await processPaymentVerification(groupId, userId, pending.images.slice(0, 2), replyToken, io);
            return;
        }
        pending.timer = setTimeout(() => handlePaymentVerifyTimeout(groupKey), PAYMENT_IMAGE_TIMEOUT);
    } else {
        pendingPaymentImages.set(groupKey, {
            images: [imageData],
            replyToken,
            timer: setTimeout(() => handlePaymentVerifyTimeout(groupKey), PAYMENT_IMAGE_TIMEOUT),
        });
    }
}

// ครบเวลาแต่ยังไม่ครบ 2 รูป — แจ้งเตือนแล้วทิ้ง (กันรอเก้อไม่มีสิ้นสุด)
async function handlePaymentVerifyTimeout(groupKey) {
    const pending = pendingPaymentImages.get(groupKey);
    pendingPaymentImages.delete(groupKey);
    if (!pending) return;
    await client.replyMessage(pending.replyToken, {
        type: 'text',
        text: `⚠️ ได้รับรูปแค่ ${pending.images.length} รูป (ต้องการ 2 รูป: รายงานตั้งเบิก + สกรีนธนาคาร)\nกรุณาส่งรูปทั้ง 2 ใบใหม่ติดกันครับ`,
    }).catch(() => {});
}

async function processPaymentVerification(groupId, userId, images, replyToken, io) {
    try {
        const extracted = await extractPaymentDocuments(images[0].buffer, images[1].buffer);
        const { matchResults, overallStatus } = matchPaymentItems(extracted.reportItems, extracted.bankItems);

        // เก็บรูปแยกตามประเภทที่ AI classify ไว้ (imageAType/imageBType อ้างอิงลำดับ images[0]/images[1])
        const reportBuffer = extracted.imageAType === 'requisition_report' ? images[0].buffer : images[1].buffer;
        const bankBuffer = extracted.imageAType === 'bank_statement' ? images[0].buffer : images[1].buffer;

        let reportImagePath = null, bankImagePath = null;
        try {
            reportImagePath = buildGCSPath(images[0].lineMessageId + '-report', '.jpg', 'payment-verify');
            await uploadToGCS(reportBuffer, reportImagePath, '.jpg');
            bankImagePath = buildGCSPath(images[1].lineMessageId + '-bank', '.jpg', 'payment-verify');
            await uploadToGCS(bankBuffer, bankImagePath, '.jpg');
        } catch (e) {
            console.error('❌ Payment verify image GCS fail:', e.message);
        }

        await PaymentVerification.create({
            groupId,
            submittedBy: userId,
            submittedAt: new Date(),
            reportImagePath,
            bankImagePath,
            reportItems: extracted.reportItems,
            bankItems: extracted.bankItems,
            matchResults,
            overallStatus,
            endingBalance: extracted.bankEndingBalance,
        });

        const total = extracted.reportItems.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
        if (overallStatus === 'matched') {
            await client.replyMessage(replyToken, {
                type: 'text',
                text: `✅ ตรวจสอบแล้ว: ตรงกันครบ ${extracted.reportItems.length} รายการ (${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท)`,
            }).catch(() => {});
        } else {
            const problems = matchResults.filter(m => m.status !== 'matched');
            const lines = problems.slice(0, 5).map(m => {
                if (m.status === 'not_found_in_bank') return `• ${m.reportItem.payee} ${Number(m.reportItem.amount).toLocaleString('th-TH')} บาท — ไม่พบในรายการโอนจริง`;
                return `• ${m.bankItem.counterName || '(ไม่ทราบชื่อ)'} ${Number(m.bankItem.amount).toLocaleString('th-TH')} บาท — มีรายการโอนที่ไม่ตรงกับตั้งเบิก`;
            }).join('\n');
            await client.replyMessage(replyToken, {
                type: 'text',
                text: `⚠️ พบรายการไม่ตรง ${problems.length} รายการ\n${lines}\n\nเข้าตรวจสอบ/แก้ไขได้ที่ Dashboard`,
            }).catch(() => {});
        }
    } catch (err) {
        console.error('❌ Payment Verification Error:', err.message);
        alertError('Payment Verification', err.message);
        await client.replyMessage(replyToken, {
            type: 'text',
            text: '❌ ตรวจสอบรายการไม่สำเร็จ (อ่านรูปไม่ได้) กรุณาลองส่งรูปใหม่อีกครั้ง',
        }).catch(() => {});
    }
}

// ─── Receipt Summary — เปิด/ปิดด้วย keyword เดียวกัน แล้วสรุปรูปบิลที่ส่งมาระหว่างนั้น ──
// พิมพ์ครั้งแรก = เริ่ม session (รอรูป) | พิมพ์ซ้ำ = ปิด session แล้วส่งรูปทั้งหมดให้ AI สรุป
async function handleReceiptSummaryToggle(event, userId, groupId) {
    const replyToken = event.replyToken;
    const sessionKey = `${groupId}_${userId}`;

    if (pendingReceiptSummary.has(sessionKey)) {
        const session = pendingReceiptSummary.get(sessionKey);
        clearTimeout(session.timer);
        pendingReceiptSummary.delete(sessionKey);

        if (session.images.length === 0) {
            await client.replyMessage(replyToken, {
                type: 'text',
                text: '⚠️ ยังไม่ได้ส่งรูปบิลเลยครับ ยกเลิกการรวบรวม' + BOT_COMMAND_NOTICE,
            }).catch(() => {});
            return;
        }

        await processReceiptSummary(session.images, replyToken);
    } else {
        const keyword = await getReceiptSummaryKeyword();
        pendingReceiptSummary.set(sessionKey, {
            images: [],
            warnedLimit: false,
            timer: setTimeout(() => pendingReceiptSummary.delete(sessionKey), RECEIPT_SUMMARY_IDLE_TIMEOUT),
        });
        await client.replyMessage(replyToken, {
            type: 'text',
            text: `📸 เริ่มรวบรวมรูปบิลแล้ว ส่งรูปได้เลย (สูงสุด ${MAX_RECEIPT_IMAGES} รูป)\nพิมพ์ "${keyword}" อีกครั้งเมื่อส่งครบเพื่อสรุป` + BOT_COMMAND_NOTICE,
        }).catch(() => {});
    }
}

// เรียกจาก handleImageMessage เมื่อกลุ่มติดธง isReceiptSummaryGroup และมี session เปิดอยู่ของ user นี้
async function handleReceiptSummaryImage(event, sessionKey, message) {
    const session = pendingReceiptSummary.get(sessionKey);
    if (!session) return; // session หมดเวลาไปพอดีระหว่างนี้

    if (session.images.length >= MAX_RECEIPT_IMAGES) {
        if (!session.warnedLimit) {
            session.warnedLimit = true;
            await client.replyMessage(event.replyToken, {
                type: 'text',
                text: `⚠️ ครบ ${MAX_RECEIPT_IMAGES} รูปแล้ว พิมพ์คำสั่งปิดเพื่อสรุปได้เลย รูปที่ส่งเพิ่มจะไม่ถูกนับ` + BOT_COMMAND_NOTICE,
            }).catch(() => {});
        }
        return;
    }

    const buffer = await downloadAsBuffer(message.id);
    session.images.push({ buffer });
    clearTimeout(session.timer);
    session.timer = setTimeout(() => pendingReceiptSummary.delete(sessionKey), RECEIPT_SUMMARY_IDLE_TIMEOUT);
}

async function processReceiptSummary(images, replyToken) {
    try {
        const extracted = await extractReceiptSummary(images.map(img => img.buffer));

        if (!extracted.storeName || extracted.items.length === 0) {
            await client.replyMessage(replyToken, {
                type: 'text',
                text: '❌ ไม่พบข้อมูลใบเสร็จในรูปที่ส่งมา กรุณาลองใหม่' + BOT_COMMAND_NOTICE,
            }).catch(() => {});
            return;
        }

        const itemsText = extracted.items.join('/');
        const totalText = extracted.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 });
        const summary = `ซื้อของหน้าร้าน ${extracted.storeName} วันที่ ${extracted.purchaseDate || '-'} (1บิล) -${itemsText} ทั้งหมด ${extracted.items.length}รายการตามบิลแนบไว้ เป็นเงิน ${totalText} บาท`;

        await client.replyMessage(replyToken, { type: 'text', text: truncateForLine(summary) + BOT_COMMAND_NOTICE })
            .catch(e => console.error('[ReceiptSummary] replyMessage error:', e.message));
    } catch (err) {
        console.error('❌ Receipt Summary Error:', err.message);
        alertError('Receipt Summary', err.message);
        await client.replyMessage(replyToken, {
            type: 'text',
            text: '❌ สรุปบิลไม่สำเร็จ (อ่านรูปไม่ได้) กรุณาลองใหม่' + BOT_COMMAND_NOTICE,
        }).catch(() => {});
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
                dbPayload.metadata = {
                    gcsPath,
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
                dbPayload.metadata = {
                    gcsPath,
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
            let gcsPath = null;
            let driveFileId = null;

            // GCS upload (ล้มเหลวได้ โดยไม่กระทบ Drive)
            try {
                gcsPath = buildGCSPath(message.id, ext, 'file');
                await uploadToGCS(buffer, gcsPath, ext);
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
                ...(gcsPath && { gcsPath }),
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
