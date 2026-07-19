const express = require('express');
const router = express.Router();
const { Message, User, Group, AdminGroup, LedgerBalanceEntry } = require('../models/index');

const { summarizeAllChatsForDate, askQuestion, extractPaymentDocuments, extractReceiptSummary, matchPaymentItems, extractTransferSlip, extractWrittenBalance } = require('../services/aiService');
const { deleteFileFromDrive } = require('../services/driveService');
const { deleteFromGCS, getSignedUrl } = require('../services/gcsService');
const { client } = require('../services/lineService');
const { getSearchKeyword, getSummarizeKeyword, escapeRegex, matchSummarizeCommand, buildSearchReply, buildSummarizeReply, resolveProviderChain, resolveVisionProviderChain, buildPaymentVerifyReply, buildReceiptSummaryReply, buildLedgerBalanceReply, buildWrittenBalanceCheckReply } = require('../services/botCommandService');
const { Op } = require('sequelize');
const authMiddleware = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');

router.use(authMiddleware);

async function getAllowedGroupIds(adminId) {
  const rows = await AdminGroup.findAll({ where: { adminId }, attributes: ['groupId'] });
  return rows.map((r) => r.groupId);
}

// คำสั่ง "ค้นหาDB xxxx" — ค้นข้ามห้อง/กลุ่มทั้งหมด (ต่างจาก "ค้นหา" ที่ scope แค่ห้องเดียว)
// superuser/admin เห็นทั้งระบบ, role user เห็นเฉพาะกลุ่มที่ตัวเองมีสิทธิ์ (กัน role user ข้ามไปเห็น
// ไฟล์ของกลุ่มที่ตัวเองไม่มีสิทธิ์เข้าถึง)
const SEARCH_DB_KEYWORD = 'ค้นหาDB';
const searchDbPattern = new RegExp(`^${escapeRegex(SEARCH_DB_KEYWORD)}\\s+(.+)`, 'u');

async function getSearchDbScope(admin) {
  if (admin.role === 'user') {
    const allowed = await getAllowedGroupIds(admin.id);
    return {
      scopeWhere: { groupId: { [Op.in]: allowed } },
      scopeLabel: 'ขอบเขต: เฉพาะกลุ่มที่คุณเป็นสมาชิก (ค้นหาทั้งหมด ไม่จำกัดช่วงเวลา)',
    };
  }
  return {
    scopeWhere: {},
    scopeLabel: 'ขอบเขต: ทั้งระบบ ทุกกลุ่ม/DM (ค้นหาทั้งหมด ไม่จำกัดช่วงเวลา)',
  };
}

// GET /api/messages?groupId=...
// Returns ALL messages for the selected group/private chat (no date filter)
router.get('/', async (req, res) => {
  try {
    const { groupId, limit = 50, before, sinceDays } = req.query;

    if (!groupId) {
      return res.status(400).json({ error: 'groupId is required' });
    }

    const where = {};

    // จำกัดว่าจะโหลดข้อความย้อนหลังกี่วัน (ตัวเลือก "load กี่วันย้อนหลัง" ฝั่ง frontend)
    if (sinceDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - parseInt(sinceDays, 10));
      where.timestamp = { [Op.gte]: cutoff };
    }

    if (groupId.startsWith('private_name_')) {
      // New format: find ALL users with this displayName, merge their messages
      const displayName = groupId.replace('private_name_', '');
      const users = await User.findAll({ where: { displayName } });
      const userIds = users.map(u => u.userId);
      where.userId = { [Op.in]: userIds.length > 0 ? userIds : ['__none__'] };
      where.groupId = { [Op.or]: [null, ''] };
    } else if (groupId.startsWith('private_')) {
      // Legacy format: specific userId
      const userId = groupId.replace('private_', '');
      where.userId = userId;
      where.groupId = { [Op.or]: [null, ''] };
    } else {
      where.groupId = groupId;
    }

    if (req.admin.role === 'user') {
      const allowed = await getAllowedGroupIds(req.admin.id);
      if (!allowed.includes(groupId)) {
        return res.json([]);
      }
    }

    // Pagination: fetch messages older than `before` timestamp — รวมกับ sinceDays ด้านบน (ถ้ามี) ไม่ให้ทับกัน
    if (before) {
      where.timestamp = { ...where.timestamp, [Op.lt]: new Date(before) };
    }

    const messages = await Message.findAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['displayName', 'pictureUrl'] },
        { model: Group, as: 'group', attributes: ['groupName', 'pictureUrl'] },
      ],
      order: [['timestamp', 'DESC']], // Get newest first
      limit: parseInt(limit, 10),
    });

    // Reverse to return them in chronological order
    messages.reverse();

    res.json(messages);
  } catch (error) {
    console.error('[ERROR] GET /api/messages:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/messages/context/:messageId — โหลดข้อความก่อนหน้า+หลังจากของข้อความนี้ (รวมตัวเอง) ในห้อง
// ที่มันสังกัดอยู่ — ใช้เปิด popup "กระโดดไปข้อความ" จากลิงก์ผลค้นหา (ดู /app-jump ฝั่ง frontend)
// ไม่ต้องรู้ groupId ล่วงหน้า เพราะหาเองจาก messageId แล้วเช็คสิทธิ์จากห้องจริงที่ข้อความนั้นสังกัดอยู่
// limit = จำนวนข้อความต่อฝั่ง (ก่อน/หลัง) ค่า default 25
router.get('/context/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const limit = parseInt(req.query.limit, 10) || 25;

    const target = await Message.findByPk(messageId);
    if (!target) {
      return res.status(404).json({ error: 'ไม่พบข้อความนี้ (อาจถูกลบไปแล้ว)' });
    }

    const roomGroupId = target.groupId || `private_${target.userId}`;

    if (req.admin.role === 'user') {
      const allowed = await getAllowedGroupIds(req.admin.id);
      if (!allowed.includes(roomGroupId)) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงห้องนี้' });
      }
    }

    const roomWhere = target.groupId
      ? { groupId: target.groupId }
      : { userId: target.userId, groupId: null };

    const includeOpts = [
      { model: User, as: 'user', attributes: ['displayName', 'pictureUrl'] },
      { model: Group, as: 'group', attributes: ['groupName', 'pictureUrl'] },
    ];

    // ก่อนหน้า (รวมตัวเอง) — เรียง DESC มาก่อนแล้วค่อย reverse ให้เป็นเก่า→ใหม่
    const beforeAndSelf = await Message.findAll({
      where: { ...roomWhere, timestamp: { [Op.lte]: target.timestamp } },
      include: includeOpts,
      order: [['timestamp', 'DESC']],
      limit: limit + 1,
    });
    beforeAndSelf.reverse();

    // หลังจากนั้น — เรียง ASC ตามธรรมชาติอยู่แล้ว
    const after = await Message.findAll({
      where: { ...roomWhere, timestamp: { [Op.gt]: target.timestamp } },
      include: includeOpts,
      order: [['timestamp', 'ASC']],
      limit,
    });

    res.json({
      groupId: roomGroupId,
      messages: [...beforeAndSelf, ...after],
      hasMoreBefore: beforeAndSelf.length === limit + 1,
    });
  } catch (error) {
    console.error('[ERROR] GET /api/messages/context/:messageId:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/messages — ลบข้อความถาวร (ทีละอันหรือหลายอันพร้อมกัน) + ลบไฟล์แนบใน GCS/Drive ด้วย
// body: { messageIds: ["uuid", ...] }
router.delete('/', async (req, res) => {
  try {
    const { messageIds } = req.body;
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ error: 'messageIds required' });
    }

    const messages = await Message.findAll({ where: { id: { [Op.in]: messageIds } } });

    // role 'user' ลบได้เฉพาะข้อความในกลุ่มที่ตัวเองมีสิทธิ์เข้าถึงเท่านั้น
    let targets = messages;
    if (req.admin.role === 'user') {
      const allowed = await getAllowedGroupIds(req.admin.id);
      const allowedSet = new Set(allowed);
      targets = messages.filter((m) => allowedSet.has(m.groupId || `private_${m.userId}`));
    }

    for (const m of targets) {
      const driveIds = m.metadata?.driveFileIds || (m.metadata?.driveFileId ? [m.metadata.driveFileId] : []);
      const gcsPaths = m.metadata?.gcsPaths || (m.metadata?.gcsPath ? [m.metadata.gcsPath] : []);

      for (const fileId of driveIds) {
        await deleteFileFromDrive(fileId).catch((e) => console.error('Drive del fail:', e.message));
      }
      for (const gcsPath of gcsPaths) {
        await deleteFromGCS(gcsPath).catch((e) => console.error('GCS del fail:', e.message));
      }
    }

    const deletedIds = targets.map((m) => m.id);
    await Message.destroy({ where: { id: { [Op.in]: deletedIds } } });

    req.app.locals.io.emit('messages-deleted', { messageIds: deletedIds });

    res.json({ deleted: targets.length });
  } catch (error) {
    console.error('[ERROR] DELETE /api/messages:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/messages/forward — ส่งต่อข้อความที่เลือกไปยังกลุ่ม/DM อื่นใน LINE จริง (push message)
// body: { messageIds: ["uuid", ...], targetGroupId: "groupId หรือ private_<userId>" }
router.post('/forward', async (req, res) => {
  try {
    const { messageIds, targetGroupId } = req.body;
    if (!Array.isArray(messageIds) || messageIds.length === 0 || !targetGroupId) {
      return res.status(400).json({ error: 'messageIds และ targetGroupId required' });
    }

    const messages = await Message.findAll({
      where: { id: { [Op.in]: messageIds } },
      order: [['timestamp', 'ASC']],
    });
    if (messages.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อความที่เลือก' });
    }

    // role 'user' ส่งต่อได้เฉพาะระหว่างกลุ่มที่ตัวเองมีสิทธิ์เข้าถึงเท่านั้น (ทั้งต้นทางและปลายทาง)
    let sourceMessages = messages;
    if (req.admin.role === 'user') {
      const allowed = await getAllowedGroupIds(req.admin.id);
      const allowedSet = new Set(allowed);
      sourceMessages = messages.filter((m) => allowedSet.has(m.groupId || `private_${m.userId}`));
      if (sourceMessages.length === 0 || !allowedSet.has(targetGroupId)) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์ส่งต่อข้อความนี้' });
      }
    }

    // หาปลายทางจริงสำหรับ LINE push (DM ต้องตัด prefix private_ ออกเหลือ userId)
    const to = targetGroupId.startsWith('private_') ? targetGroupId.slice('private_'.length) : targetGroupId;

    // LINE ต้อง fetch เนื้อหาไฟล์จริงจาก originalContentUrl/previewImageUrl โดยตรง — ใช้ signed GCS URL
    // ตรงๆ (ไม่ผ่าน /api/media ที่ตอบกลับด้วย 302 redirect เพราะ LINE ไม่ follow redirect แล้วโชว์
    // เป็นกรอบว่างแทน)
    const outgoing = [];

    for (const m of sourceMessages) {
      switch (m.messageType) {
        case 'text':
          outgoing.push({ type: 'text', text: m.text || '' });
          break;
        case 'image': {
          const paths = m.metadata?.gcsPaths || (m.metadata?.gcsPath ? [m.metadata.gcsPath] : []);
          for (const p of paths) {
            const url = await getSignedUrl(p, 60);
            outgoing.push({ type: 'image', originalContentUrl: url, previewImageUrl: url });
          }
          break;
        }
        case 'audio':
          if (m.metadata?.gcsPath) {
            const url = await getSignedUrl(m.metadata.gcsPath, 60);
            outgoing.push({
              type: 'audio',
              originalContentUrl: url,
              duration: m.metadata?.duration || 1000,
            });
          }
          break;
        case 'sticker':
          if (m.metadata?.packageId && m.metadata?.stickerId) {
            outgoing.push({ type: 'sticker', packageId: m.metadata.packageId, stickerId: m.metadata.stickerId });
          }
          break;
        case 'location':
          outgoing.push({
            type: 'location',
            title: m.metadata?.address || 'ตำแหน่งที่ตั้ง',
            address: m.metadata?.address || '',
            latitude: m.metadata?.lat,
            longitude: m.metadata?.lng,
          });
          break;
        default: {
          // video, file และประเภทอื่นที่ LINE ไม่มี message type รองรับ (หรือขาด preview) → fallback เป็นลิงก์
          const gcsPath = m.metadata?.gcsPath || m.metadata?.gcsPaths?.[0];
          const label = { video: '🎬 วิดีโอ', file: `📎 ${m.metadata?.fileName || 'ไฟล์'}` }[m.messageType] || '📎 ไฟล์แนบ';
          const url = gcsPath ? await getSignedUrl(gcsPath, 60) : null;
          outgoing.push({ type: 'text', text: url ? `${label}: ${url}` : label });
        }
      }
    }

    // LINE pushMessage ส่งได้สูงสุด 5 messages ต่อ call → chunk แล้วยิงทีละชุดตามลำดับ
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < outgoing.length; i += 5) {
      const chunk = outgoing.slice(i, i + 5);
      try {
        await client.pushMessage(to, chunk);
        sent += chunk.length;
      } catch (e) {
        console.error('[Forward] pushMessage failed:', e.message);
        failed += chunk.length;
      }
    }

    res.json({ sent, failed });
  } catch (error) {
    console.error('[ERROR] POST /api/messages/forward:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/messages/send — พิมพ์ข้อความส่งตรงเข้าห้อง LINE (push) จากหน้า dashboard
// เฉพาะ role superuser/admin เท่านั้น — ไม่บันทึกข้อความนี้ลง DB (เหมือน /forward)
// body: { groupId, text }
router.post('/send', requireAdmin, async (req, res) => {
  try {
    const { groupId, text } = req.body;
    if (!groupId || !text || !text.trim()) {
      return res.status(400).json({ error: 'groupId และ text required' });
    }

    const to = groupId.startsWith('private_') ? groupId.slice('private_'.length) : groupId;
    await client.pushMessage(to, { type: 'text', text: text.trim() });

    res.json({ success: true });
  } catch (error) {
    console.error('[ERROR] POST /api/messages/send:', error);
    res.status(500).json({ error: error.message });
  }
});

// ข้อความช่วยเหลือคำสั่ง "showfeature" — DM "AI ผู้ช่วย" เท่านั้น ไม่ผ่าน LINE, static ล้วนๆ ไม่เรียก LLM
// ใช้คำภาษาอังกฤษคำเดียวติดกัน (ไม่ใช่ "feature" เฉยๆ) เพื่อกันชนกับคำถามทั่วไปที่มีคำว่า feature ปนอยู่
const FEATURE_HELP_TEXT = `📋 ฟีเจอร์ในกล่อง "AI ผู้ช่วย" นี้ มี 3 โหมด:

💬 คุยกับ AI ธรรมดา — พิมพ์คุยแบบ free-form ได้เลย ไม่ผูกคำสั่งตายตัว

🔍 ค้นหาDB — ค้นข้อความ/ไฟล์ข้ามทุกกลุ่ม/DM ทั้งระบบ

🧪 ทดสอบ OCR — ทดสอบฟีเจอร์ตรวจสอบการโอน (2 รูป) / สรุปใบเสร็จ (1-10 รูป) โดยอัปโหลดรูปตรงจาก dashboard ไม่ผ่าน LINE ไม่บันทึกลง DB

━━━━━━━━━━━━━━━

📋 ฟีเจอร์ OCR ที่ใช้งานจริงผ่าน LINE (แยกจากกล่องนี้ ต้องเปิดธงกลุ่มก่อนใน Dashboard):

💳 ตรวจสอบการโอน-ตั้งเบิก — ส่งรายงานตั้งเบิก + สกรีนธนาคาร 2 รูป เทียบยอดให้อัตโนมัติ

🧾 สรุปบิลซื้อของ — พิมพ์คำสั่งเปิด แล้วส่งรูปใบเสร็จ (สูงสุด 10 รูป) สรุปให้เป็นข้อความ

📖 เช็คยอดสมุดบัญชี (ยืม-คืนเงิน) — ส่งสลิปโอนเงิน 1-2 รูป ระบบคำนวณยอดคงเหลือต่อเนื่องให้เอง (จำยอดเอง ไม่อ่านจากรูปสมุดใหม่ทุกครั้ง) พิมพ์ "เช็คสมุด" + แนบรูปหน้าสมุด เพื่อตั้งยอดเริ่มต้นหรือเทียบยอดกับที่เขียนจริง

พิมพ์ "showfeature" เพื่อดูข้อความนี้อีกครั้งได้ทุกเมื่อ`;

// POST /api/messages/ask — คุยกับ AI ผู้ช่วยแบบ free-form ผ่าน dashboard (ไม่ผ่าน LINE เลย)
// ใช้กับ DM พิเศษ "AI ผู้ช่วย" เท่านั้น — ไม่ผูกคำสั่งตายตัว ถามอะไรก็ได้ ไม่บันทึกบทสนทนานี้ลง DB
// body: { text }
router.post('/ask', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text required' });
    }

    const trimmedText = text.trim();

    // "showfeature" ดักก่อนทุกอย่าง — static help text ไม่ต้องเรียก LLM (case-insensitive กันพิมพ์ตัวใหญ่/เล็กปน)
    if (trimmedText.toLowerCase() === 'showfeature') {
      return res.json({ reply: FEATURE_HELP_TEXT });
    }

    // "ค้นหาDB xxxx" ดักก่อนส่งเข้า LLM แบบ free-form — ค้นข้อมูลในระบบจริง ไม่ใช่ถาม AI
    const searchDbMatch = trimmedText.match(searchDbPattern);
    if (searchDbMatch) {
      const { scopeWhere, scopeLabel } = await getSearchDbScope(req.admin);
      const reply = await buildSearchReply(searchDbMatch[1].trim(), scopeWhere, scopeLabel);
      return res.json({ reply });
    }

    // fallback ของ askQuestion (ตอน compound-mini พัง) ไล่ตาม priority-chain เดียวกับงานสรุปแชท
    const fallbackChain = await resolveProviderChain('auto').catch(() => []);
    const result = await askQuestion(trimmedText, fallbackChain);
    res.json({ reply: result.text });
  } catch (error) {
    console.error('[ERROR] POST /api/messages/ask:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/messages/test-ocr — ทดสอบ OCR จากรูปอัปโหลดตรงจาก dashboard, ไม่ผ่าน LINE
// เรียก pipeline เดียวกับ LINE จริงทุกขั้นตอน (resolveVisionProviderChain → extract*() →
// matchPaymentItems() → buildPaymentVerifyReply()/buildReceiptSummaryReply()) แต่ข้าม
// ทุกขั้นตอนที่มีผลข้างเคียง (ไม่มี PaymentVerification.create, uploadToGCS, ledger sync)
// เฉพาะ superuser/admin — error คืนเป็นข้อความจริงจาก exception แทนข้อความทั่วไปแบบ LINE
// เพราะจุดประสงค์คือ debug ปัญหา vision-provider ตรงๆ
//
// type 'ledger-slip'/'ledger-book' (ฟีเจอร์ "เช็คยอดสมุดบัญชี") ต้องมี groupId เพิ่ม — อ่านยอด
// ปัจจุบันจริงของกลุ่มนั้น (read-only) มาคำนวณ preview เฉยๆ ไม่มี LedgerBalanceEntry.create เด็ดขาด
// เพราะยอดจริงต้องมาจาก LINE เท่านั้น (ระบบจำยอดต่อเนื่อง พลาดจากการทดสอบไม่ได้)
//
// body: { type: 'payment'|'receipt'|'ledger-slip'|'ledger-book', images: string[], groupId?: string }
router.post('/test-ocr', requireAdmin, async (req, res) => {
  try {
    const { type, images, groupId } = req.body;
    const VALID_TYPES = ['payment', 'receipt', 'ledger-slip', 'ledger-book'];
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `type ต้องเป็นหนึ่งใน ${VALID_TYPES.join(', ')}` });
    }
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'images required (array ของ data URL)' });
    }
    if (type === 'payment' && images.length !== 2) {
      return res.status(400).json({ error: `ตรวจสอบการโอน-ตั้งเบิกต้องอัปโหลดรูปพอดี 2 รูป (ได้รับ ${images.length} รูป)` });
    }
    if (type === 'receipt' && (images.length < 1 || images.length > 10)) {
      return res.status(400).json({ error: `สรุปใบเสร็จต้องอัปโหลด 1-10 รูป (ได้รับ ${images.length} รูป)` });
    }
    if (type === 'ledger-slip' && (images.length < 1 || images.length > 2)) {
      return res.status(400).json({ error: `สลิปโอนเงินต้องอัปโหลด 1-2 รูป (ได้รับ ${images.length} รูป)` });
    }
    if (type === 'ledger-book' && images.length !== 1) {
      return res.status(400).json({ error: `รูปสมุดบัญชีต้องอัปโหลดพอดี 1 รูป (ได้รับ ${images.length} รูป)` });
    }
    if ((type === 'ledger-slip' || type === 'ledger-book') && !groupId) {
      return res.status(400).json({ error: 'groupId required สำหรับทดสอบเช็คยอดสมุดบัญชี' });
    }

    const buffers = images.map((dataUrl, i) => {
      const match = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl || '');
      if (!match) throw new Error(`รูปที่ ${i + 1} ไม่ใช่ base64 data URL ที่ถูกต้อง`);
      return Buffer.from(match[1], 'base64');
    });

    const visionChain = await resolveVisionProviderChain();

    if (type === 'payment') {
      const extracted = await extractPaymentDocuments(buffers[0], buffers[1], visionChain);
      const { matchResults, overallStatus } = matchPaymentItems(extracted.reportItems, extracted.bankItems);
      return res.json({ reply: buildPaymentVerifyReply(extracted, matchResults, overallStatus), model: extracted.model });
    }

    if (type === 'receipt') {
      const extracted = await extractReceiptSummary(buffers, visionChain);
      return res.json({ reply: buildReceiptSummaryReply(extracted), model: extracted.model });
    }

    if (type === 'ledger-slip') {
      const group = await Group.findByPk(groupId);
      const referenceName = (group?.ledgerReferenceName || '').trim();
      if (!referenceName) {
        return res.status(400).json({ error: 'กลุ่มนี้ยังไม่ได้ตั้งค่า "ชื่ออ้างอิง" — ไปตั้งค่าที่ AdminPanel ก่อน' });
      }

      const extracted = await extractTransferSlip(buffers, visionChain, referenceName);
      if (!extracted.direction) {
        return res.json({
          reply: `⚠️ (ทดสอบ) ไม่สามารถระบุทิศทางเงิน (ยืม/คืน) ได้จากสลิปนี้ครับ${extracted.note ? '\n' + extracted.note : ''}`,
          model: extracted.model,
          extracted,
        });
      }

      const latestEntry = await LedgerBalanceEntry.findOne({ where: { groupId }, order: [['submittedAt', 'DESC']] });
      if (!latestEntry) {
        return res.json({
          reply: '⚠️ (ทดสอบ) กลุ่มนี้ยังไม่มียอดตั้งต้นเลยในระบบ — ต้องทดสอบโหมด "เช็คสมุด" ก่อนถึงจะมียอดให้คำนวณต่อได้',
          model: extracted.model,
          extracted,
        });
      }

      const previousBalance = Number(latestEntry.calculatedBalance);
      const calculatedBalance = extracted.direction === 'in'
        ? previousBalance + extracted.amount
        : previousBalance - extracted.amount;
      const previewEntry = { direction: extracted.direction, amount: extracted.amount, previousBalance, calculatedBalance };
      return res.json({
        reply: buildLedgerBalanceReply(previewEntry) + '\n\n🧪 โหมดทดสอบ — ไม่ได้บันทึกยอดนี้ลงระบบจริง',
        model: extracted.model,
        extracted,
      });
    }

    // type === 'ledger-book'
    const extracted = await extractWrittenBalance(buffers[0], visionChain);
    const latestEntry = await LedgerBalanceEntry.findOne({ where: { groupId }, order: [['submittedAt', 'DESC']] });
    if (!latestEntry) {
      const balanceText = Number(extracted.balance).toLocaleString('th-TH', { minimumFractionDigits: 2 });
      return res.json({
        reply: `✅ (ทดสอบ) ถ้าส่งรูปนี้จริง จะถูกใช้ตั้งยอดเริ่มต้นเป็น ${balanceText} บาท (กลุ่มนี้ยังไม่มีรายการใดเลยในระบบ)\n\n🧪 โหมดทดสอบ — ไม่ได้บันทึกจริง`,
        model: extracted.model,
        extracted,
      });
    }

    const matches = Math.abs(Number(latestEntry.calculatedBalance) - extracted.balance) < 0.01;
    const previewEntry = { calculatedBalance: latestEntry.calculatedBalance, writtenBalanceExtracted: extracted.balance, matchesWrittenBalance: matches };
    return res.json({
      reply: buildWrittenBalanceCheckReply(previewEntry) + '\n\n🧪 โหมดทดสอบ — ไม่ได้บันทึกจริง',
      model: extracted.model,
      extracted,
    });
  } catch (error) {
    console.error('[ERROR] POST /api/messages/test-ocr:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/messages/command — เช็ค+ตอบคำสั่ง "ค้นหา"/"สรุปเลย" ที่พิมพ์ในช่องแชทของกลุ่ม/DM จริง
// สโคปเฉพาะห้องนั้นห้องเดียว (เหมือนพิมพ์คำสั่งนี้ใน LINE ตรงๆ) — ไม่บันทึกลง DB, ไม่ push เข้า LINE
// body: { groupId, text } — คืน { isCommand: false } ถ้า text ไม่ตรงคำสั่งไหนเลย (ให้ frontend ไป
// flow ส่งจริงแทน)
router.post('/command', async (req, res) => {
  try {
    const { groupId, text } = req.body;
    if (!groupId || !text || !text.trim()) {
      return res.status(400).json({ error: 'groupId และ text required' });
    }

    if (req.admin.role === 'user') {
      const allowed = await getAllowedGroupIds(req.admin.id);
      if (!allowed.includes(groupId)) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงกลุ่มนี้' });
      }
    }

    // "ค้นหาDB xxxx" ค้นข้ามห้อง/กลุ่มทั้งหมด — เช็คก่อนคำสั่ง "ค้นหา" ปกติ (scope ต่างกัน)
    const searchDbMatch = text.trim().match(searchDbPattern);
    if (searchDbMatch) {
      const { scopeWhere, scopeLabel } = await getSearchDbScope(req.admin);
      const reply = await buildSearchReply(searchDbMatch[1].trim(), scopeWhere, scopeLabel);
      return res.json({ isCommand: true, reply });
    }

    const searchKeyword = await getSearchKeyword();
    const searchPattern = new RegExp(`^${escapeRegex(searchKeyword)}\\s+(.+)`, 'u');
    const searchMatch = text.trim().match(searchPattern);

    const summarizeKeyword = await getSummarizeKeyword();
    const { isMatch: isSummarizeCommand, daysBack } = matchSummarizeCommand(text, summarizeKeyword);

    if (!searchMatch && !isSummarizeCommand) {
      return res.json({ isCommand: false });
    }

    let scopeWhere, roomLabel;
    if (groupId.startsWith('private_')) {
      scopeWhere = { userId: groupId.slice('private_'.length), groupId: null };
      roomLabel = 'ขอบเขต: DM นี้เท่านั้น';
    } else {
      scopeWhere = { groupId };
      const group = await Group.findByPk(groupId);
      roomLabel = `ขอบเขต: กลุ่ม "${group?.groupName || groupId}" เท่านั้น`;
    }

    // ค้นหาไม่มีการจำกัดช่วงเวลาเลย (ดูทั้งประวัติของห้องนี้) ต่างจากสรุปที่บอกช่วงวันอยู่แล้วในตัวเอง
    // เลยต้องบอกเพิ่มเฉพาะฝั่งค้นหาว่าดูทั้งหมดไม่จำกัดวัน กันเข้าใจผิดว่าค้นหาแค่ล่าสุด
    const reply = searchMatch
      ? await buildSearchReply(searchMatch[1].trim(), scopeWhere, `${roomLabel}, ไม่จำกัดช่วงเวลา (ค้นหาทั้งหมด)`)
      : await buildSummarizeReply(daysBack, scopeWhere, roomLabel);

    res.json({ isCommand: true, reply });
  } catch (error) {
    console.error('[ERROR] POST /api/messages/command:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/messages/summarize-day
router.post('/summarize-day', async (req, res) => {
  try {
    const { date, rangeValue, rangeUnit, groupId, provider = 'auto' } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    let whereClause = {};

    if (date === 'all') {
      // Summarize ALL messages within the selected range (if provided)
      if (rangeValue && rangeUnit) {
        const unitMap = { day: 'days', month: 'months', year: 'years' };
        const pgUnit = unitMap[rangeUnit] || 'days';
        const cutoff = new Date();
        if (rangeUnit === 'day') cutoff.setDate(cutoff.getDate() - parseInt(rangeValue));
        if (rangeUnit === 'month') cutoff.setMonth(cutoff.getMonth() - parseInt(rangeValue));
        if (rangeUnit === 'year') cutoff.setFullYear(cutoff.getFullYear() - parseInt(rangeValue));
        whereClause = { timestamp: { [Op.gte]: cutoff } };
      }
      // else: no date restriction → all messages ever
    } else {
      // +07:00 ไม่ใช่ Z — date เป็นวันที่ปฏิทินไทย (Asia/Bangkok) ถ้าตีเป็น UTC midnight ตรงๆ
      // ขอบเขตจะเลื่อนไป 7 ชม. (พลาดข้อความ 00:00-06:59 ของวันนั้นตามเวลาไทย)
      const start = new Date(date + 'T00:00:00.000+07:00');
      const end = new Date(date + 'T23:59:59.999+07:00');
      whereClause = { timestamp: { [Op.between]: [start, end] } };
    }

    if (groupId && groupId !== 'all') {
      whereClause.groupId = groupId;
    }

    if (req.admin.role === 'user') {
      const allowed = await getAllowedGroupIds(req.admin.id);
      if (groupId && groupId !== 'all') {
        if (!allowed.includes(groupId)) {
          return res.json({ summary: 'ไม่มีข้อความในช่วงนี้', messageCount: 0, groupCount: 0 });
        }
      } else {
        whereClause.groupId = { [Op.in]: allowed.length ? allowed : ['__none__'] };
      }
    }

    const allMessages = await Message.findAll({
      where: whereClause,
      include: [
        { model: User, as: 'user', attributes: ['displayName'] },
        { model: Group, as: 'group', attributes: ['groupName'] },
      ],
      order: [['timestamp', 'ASC']],
      limit: 2000,
    });

    if (allMessages.length === 0) {
      return res.json({ summary: 'ไม่มีข้อความในช่วงนี้', messageCount: 0, groupCount: 0 });
    }

    // provider: 'auto' = ไล่ตามลำดับความสำคัญทั้งหมด (fallback อัตโนมัติ), เจาะจง id = บังคับตัวเดียว
    let chain;
    try {
      chain = await resolveProviderChain(provider);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const result = await summarizeAllChatsForDate(allMessages, chain);
    res.json(result);
  } catch (error) {
    console.error('[ERROR] POST /api/messages/summarize-day:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/messages/drive-files
router.get('/drive-files', async (req, res) => {
  try {
    const where = { messageType: { [Op.in]: ['file', 'image'] } };
    const groupId = req.query.groupId;

    if (groupId) {
      if (groupId.startsWith('private_name_')) {
        const displayName = groupId.replace('private_name_', '');
        const users = await User.findAll({ where: { displayName } });
        const userIds = users.map(u => u.userId);
        where.userId = { [Op.in]: userIds.length > 0 ? userIds : ['__none__'] };
        where.groupId = { [Op.or]: [null, ''] };
      } else if (groupId.startsWith('private_')) {
        where.userId = groupId.replace('private_', '');
        where.groupId = { [Op.or]: [null, ''] };
      } else {
        where.groupId = groupId;
      }
    }

    if (req.admin.role === 'user') {
      const allowed = await getAllowedGroupIds(req.admin.id);
      if (!groupId) {
        where.groupId = { [Op.in]: allowed.length ? allowed : ['__none__'] };
      } else if (!allowed.includes(groupId)) {
        return res.json([]);
      }
    }

    const messages = await Message.findAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['displayName'] },
        { model: Group, as: 'group', attributes: ['groupName', 'groupId'] },
      ],
      order: [['timestamp', 'DESC']],
    });

    const files = messages
      .filter(m => m.metadata?.driveFileId || m.metadata?.driveFileIds?.length > 0)
      .map(m => {
        if (m.messageType === 'image') {
          const ids = m.metadata.driveFileIds || [];
          return {
            id: m.id,
            messageType: 'image',
            fileName: `รูปภาพ (${ids.length} รูป)`,
            fileSize: null,
            driveUrl: ids.length > 0 ? `https://drive.google.com/file/d/${ids[0]}/view` : null,
            groupName: m.group?.groupName || m.user?.displayName,
            groupId: m.groupId,
            uploadedBy: m.user?.displayName,
            timestamp: m.timestamp,
          };
        }
        return {
          id: m.id,
          messageType: 'file',
          fileName: m.metadata.fileName,
          fileSize: m.metadata.fileSize,
          driveUrl: `https://drive.google.com/file/d/${m.metadata.driveFileId}/view`,
          groupName: m.group?.groupName || m.user?.displayName,
          groupId: m.groupId,
          uploadedBy: m.user?.displayName,
          timestamp: m.timestamp,
        };
      });

    res.json(files);
  } catch (error) {
    console.error('[ERROR] GET /api/messages/drive-files:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/messages/drive-files
router.delete('/drive-files', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ error: 'ids required' });

    const messages = await Message.findAll({ where: { id: { [Op.in]: ids } } });

    for (const m of messages) {
      if (m.messageType === 'image') {
        for (const fileId of m.metadata?.driveFileIds || []) {
          await deleteFileFromDrive(fileId).catch(e => console.error('Drive del fail:', e.message));
        }
        for (const gcsPath of m.metadata?.gcsPaths || []) {
          await deleteFromGCS(gcsPath).catch(e => console.error('GCS del fail:', e.message));
        }
        const newMeta = { ...m.metadata };
        delete newMeta.driveFileIds;
        delete newMeta.gcsPaths;
        delete newMeta.gcsUrls;
        await m.update({ metadata: newMeta });
      } else {
        if (m.metadata?.driveFileId)
          await deleteFileFromDrive(m.metadata.driveFileId).catch(e => console.error('Drive del fail:', e.message));
        if (m.metadata?.gcsPath)
          await deleteFromGCS(m.metadata.gcsPath).catch(e => console.error('GCS del fail:', e.message));
        const newMeta = { ...m.metadata };
        delete newMeta.driveFileId;
        delete newMeta.gcsPath;
        delete newMeta.gcsUrl;
        await m.update({ metadata: newMeta });
      }
    }

    res.json({ deleted: messages.length });
  } catch (error) {
    console.error('[ERROR] DELETE /api/messages/drive-files:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/messages/important?groupId=...
router.get('/important', async (req, res) => {
  try {
    const { groupId } = req.query;
    const where = { isImportant: true };

    if (groupId) {
      if (groupId.startsWith('private_name_')) {
        const displayName = groupId.replace('private_name_', '');
        const users = await User.findAll({ where: { displayName } });
        const userIds = users.map((u) => u.userId);
        where.userId = { [Op.in]: userIds.length > 0 ? userIds : ['__none__'] };
        where.groupId = { [Op.or]: [null, ''] };
      } else if (groupId.startsWith('private_')) {
        const userId = groupId.replace('private_', '');
        where.userId = userId;
        where.groupId = { [Op.or]: [null, ''] };
      } else {
        where.groupId = groupId;
      }
    }

    if (req.admin.role === 'user') {
      const allowed = await getAllowedGroupIds(req.admin.id);
      if (!groupId) {
        where.groupId = { [Op.in]: allowed.length ? allowed : ['__none__'] };
      } else if (!allowed.includes(groupId)) {
        return res.json([]);
      }
    }

    const messages = await Message.findAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['displayName', 'pictureUrl'] },
        { model: Group, as: 'group', attributes: ['groupName', 'pictureUrl'] },
      ],
      order: [['timestamp', 'DESC']],
      limit: 200,
    });

    messages.reverse();
    res.json(messages);
  } catch (error) {
    console.error('[ERROR] GET /api/messages/important:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/messages/:messageId/important — toggle important flag
router.patch('/:messageId/important', async (req, res) => {
  try {
    const msg = await Message.findOne({ where: { messageId: req.params.messageId } });
    if (!msg) return res.status(404).json({ error: 'ไม่พบข้อความ' });

    if (req.admin.role === 'user') {
      const allowed = await getAllowedGroupIds(req.admin.id);
      const scopeId = msg.groupId || `private_${msg.userId}`;
      if (!allowed.includes(scopeId)) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
      }
    }

    msg.isImportant = !msg.isImportant;
    await msg.save();
    res.json({ messageId: msg.messageId, isImportant: msg.isImportant });
  } catch (error) {
    console.error('[ERROR] PATCH /api/messages/:messageId/important:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/messages/search?q=...&limit=30
// ค้นใน: text, ชื่อคนส่ง, ชื่อกลุ่ม, ชื่อไฟล์
router.get('/search', async (req, res) => {
  try {
    const { q, limit = 30 } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);

    const term = `%${q.trim()}%`;

    let groupFilter = `m."groupId" IS NOT NULL AND m."groupId" <> ''`;
    const replacements = { term, limit: parseInt(limit, 10) };

    if (req.admin.role === 'user') {
      const allowed = await getAllowedGroupIds(req.admin.id);
      groupFilter += ` AND m."groupId" = ANY(:allowedIds)`;
      replacements.allowedIds = allowed.length ? allowed : ['__none__'];
    }

    const rows = await Message.sequelize.query(
      `SELECT
         m."messageId",
         m."groupId",
         m.text,
         m.timestamp,
         m.metadata,
         g."groupName",
         g."pictureUrl",
         u."displayName"
       FROM messages m
       LEFT JOIN "Groups" g ON m."groupId" = g."groupId"
       LEFT JOIN "Users"  u ON m."userId"  = u."userId"
       WHERE ${groupFilter}
         AND (
           m.text                     ILIKE :term
           OR u."displayName"         ILIKE :term
           OR g."groupName"           ILIKE :term
           OR m.metadata->>'fileName' ILIKE :term
         )
       ORDER BY m.timestamp DESC
       LIMIT :limit`,
      { replacements, type: 'SELECT' }
    );

    res.json(rows);
  } catch (error) {
    console.error('[ERROR] GET /api/messages/search:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;