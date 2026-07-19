
const axios = require('axios');

// ── Groq ────────────────────────────────────────────────────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';

// ── Helper: แปลงข้อความแต่ละประเภทเป็น text ────────────────────────────────
function formatMessageContent(m) {
  if (m.messageType === 'text') return m.text || '';
  if (m.messageType === 'image') return `[ส่งรูป ${m.metadata?.imageCount || 1} รูป]`;
  if (m.messageType === 'sticker') return '[ส่งสติกเกอร์]';
  if (m.messageType === 'video') return '[ส่งวิดีโอ]';
  if (m.messageType === 'file') return `[ส่งไฟล์: ${m.metadata?.fileName || 'ไม่ทราบชื่อ'}]`;
  if (m.messageType === 'location') return `[แชร์ตำแหน่ง: ${m.metadata?.address || ''}]`;
  if (m.messageType === 'audio') return '[ส่งเสียง]';
  return `[${m.messageType}]`;
}

// ── Helper: แปลงวันที่เป็นภาษาไทย ───────────────────────────────────────────
function formatThaiDate(dateObj) {
  return dateObj.toLocaleDateString('th-TH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ── Helper: แปลง Date เป็น key เปรียบเทียบวัน (YYYY-MM-DD local) ─────────────
function toDayKey(dateObj) {
  const d = new Date(dateObj);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Build chat summary text + prompt ────────────────────────────────────────
function buildPrompt(allMessages) {
  const timestamps = allMessages.map(m => new Date(m.timestamp));
  const minDate = new Date(Math.min(...timestamps.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...timestamps.map(d => d.getTime())));

  const uniqueDayKeys = [...new Set(allMessages.map(m => toDayKey(new Date(m.timestamp))))];
  uniqueDayKeys.sort();
  const isMultiDay = uniqueDayKeys.length > 1;

  let dateRangeLabel;
  if (!isMultiDay) {
    dateRangeLabel = formatThaiDate(minDate);
  } else {
    dateRangeLabel = `${formatThaiDate(minDate)} — ${formatThaiDate(maxDate)} (${uniqueDayKeys.length} วัน)`;
  }

  const allGroupKeys = new Set();
  let chatSummaryText = '';

  if (isMultiDay) {
    const byDate = {};
    allMessages.forEach(m => {
      const dayKey = toDayKey(new Date(m.timestamp));
      if (!byDate[dayKey]) byDate[dayKey] = { dateObj: new Date(m.timestamp), groups: {} };
      const groupKey = m.groupId || `private_${m.userId}`;
      allGroupKeys.add(groupKey);
      if (!byDate[dayKey].groups[groupKey]) {
        byDate[dayKey].groups[groupKey] = {
          name: m.group?.groupName || m.user?.displayName || 'Unknown',
          isPrivate: !m.groupId,
          messages: [],
        };
      }
      byDate[dayKey].groups[groupKey].messages.push(m);
    });

    uniqueDayKeys.forEach(dayKey => {
      const dayData = byDate[dayKey];
      const thaiDate = formatThaiDate(dayData.dateObj);
      chatSummaryText += `\n${'═'.repeat(60)}\n📅 วันที่: ${thaiDate}\n${'═'.repeat(60)}\n`;
      Object.entries(dayData.groups).forEach(([, data]) => {
        const groupLabel = data.isPrivate ? `💬 แชทส่วนตัว: ${data.name}` : `👥 กลุ่ม: ${data.name}`;
        chatSummaryText += `\n  ── ${groupLabel} (${data.messages.length} ข้อความ) ──\n`;
        data.messages.forEach(m => {
          const d = new Date(m.timestamp);
          const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
          chatSummaryText += `  [${time}] ${m.user?.displayName || 'Unknown'}: ${formatMessageContent(m)}\n`;
        });
      });
    });
  } else {
    const groupedMessages = {};
    allMessages.forEach(m => {
      const key = m.groupId || `private_${m.userId}`;
      allGroupKeys.add(key);
      if (!groupedMessages[key]) {
        groupedMessages[key] = {
          name: m.group?.groupName || m.user?.displayName || 'Unknown',
          isPrivate: !m.groupId,
          messages: [],
        };
      }
      groupedMessages[key].messages.push(m);
    });
    Object.entries(groupedMessages).forEach(([, data]) => {
      const groupLabel = data.isPrivate ? `💬 แชทส่วนตัว: ${data.name}` : `👥 กลุ่ม: ${data.name}`;
      chatSummaryText += `\n\n=== ${groupLabel} (${data.messages.length} ข้อความ) ===\n`;
      data.messages.forEach(m => {
        const d = new Date(m.timestamp);
        const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        chatSummaryText += `[${time}] ${m.user?.displayName || 'Unknown'}: ${formatMessageContent(m)}\n`;
      });
    });
  }

  const perGroupInstruction = isMultiDay
    ? `## สรุปแต่ละวัน\nเรียงจากวันเก่าไปวันใหม่ สำหรับแต่ละวันให้แสดงชื่อวัน กิจกรรมหลักในแต่ละกลุ่ม และประเด็นสำคัญ`
    : `## สรุปแต่ละกลุ่ม\n1. **[ชื่อกลุ่มหรือแชท]**\n   - หัวข้อหลัก: ...\n   - ประเด็นสำคัญ: ...`;

  const prompt = `คุณเป็นผู้ช่วย AI ที่เชี่ยวชาญในการสรุปบทสนทนา LINE OA ของทีม
กรุณาสรุปบทสนทนาต่อไปนี้เป็นภาษาไทย กระชับ อ่านง่าย ไม่ใช้ emoji ในเนื้อหา

ข้อมูล: ${dateRangeLabel} | ${allMessages.length} ข้อความ | ${allGroupKeys.size} กลุ่ม/แชท

ใช้รูปแบบ Markdown ต่อไปนี้:

## ภาพรวม
สรุป 2-3 ประโยคว่ามีกิจกรรมอะไรบ้าง

${perGroupInstruction}

## Highlights
- สิ่งที่สำคัญที่สุด

## สิ่งที่ต้องติดตาม
- งานหรือประเด็นค้างอยู่ (ถ้าไม่มีให้ระบุว่า ไม่มี)

---
บทสนทนา:
${chatSummaryText}`;

  return { prompt, uniqueDayKeys, allGroupKeys, dateRangeLabel };
}

// ── Call Groq ────────────────────────────────────────────────────────────────
// model: เลือกโมเดลตามงาน — ค่า default ใช้กับงานสรุปแชททั่วไป (ไม่ต้องค้นเว็บ เน้นเร็ว)
// ส่วนงานที่ต้องการข้อมูลเรียลไทม์ (เช่น askQuestion) ให้ระบุ 'groq/compound-mini' แทน
const GROQ_MODEL_LABELS = {
  [GROQ_MODEL]: 'Llama 3.3 70B (Groq)',
  'groq/compound-mini': 'Compound Mini (Groq, web search)',
};

async function callGroq(prompt, model = GROQ_MODEL) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY ยังไม่ได้ตั้งค่าใน .env');

  const response = await axios.post(
    GROQ_API,
    {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
      temperature: 0.7,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
    }
  );

  return {
    text: response.data.choices[0].message.content,
    modelLabel: GROQ_MODEL_LABELS[model] || model,
  };
}

// ── ตัดอักขระควบคุม (newline/tab/ตัวควบคุมอื่นๆ) ที่มักติดมาจากการ copy-paste ──────────
// ถ้าหลุดเข้าไปใน header เช่น Authorization: Bearer <key> ที่มี \n ปนอยู่ Node จะโยน
// "Invalid character in header content" ทันที — .trim() เดิมตัดได้แค่หัว-ท้าย ไม่ตัดตรงกลาง
function sanitizeCredential(str) {
  return (str || '').replace(/[\r\n\t\x00-\x1F\x7F]/g, '').trim();
}

// ── ดึงข้อความคำตอบจาก response ของ endpoint แบบ OpenAI-compatible ──────────────
// บาง provider (โดยเฉพาะที่ผ่าน gateway อย่าง OpenRouter) ตอบ HTTP 200 กลับมาได้ทั้งที่
// เนื้อหาจริงเป็น error object (ไม่มี choices) — ถ้าเจอแบบนี้ ให้โยน error ที่มี response
// ดิบแนบไปด้วยเลย จะได้เห็นว่า provider บ่นอะไรจริงๆ แทนที่จะเจอแค่ "Cannot read ... '0'"
function extractChatReply(responseData) {
  const choice = responseData?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === 'string') return content;

  // reasoning model (เช่น GLM/DeepSeek-R1 ฯลฯ) ใช้ token ไปกับการ "คิด" ภายในก่อนตอบจริง
  // ถ้า max_tokens ให้น้อยไป อาจหมดโควตาตั้งแต่ยังไม่ทันตอบ (finish_reason: "length", content: null)
  // — นี่ไม่ใช่ error การเชื่อมต่อ (auth/URL/model ถูกหมดแล้ว) แค่ token ไม่พอ ต้องแยกข้อความให้ชัดเจน
  if (choice?.finish_reason === 'length') {
    throw new Error('เชื่อมต่อ provider สำเร็จ (auth/URL/model ถูกต้อง) แต่โมเดลนี้ตอบไม่ทันเพราะ token หมดก่อน — มักเป็น reasoning model ที่ใช้ token คิดเยอะ ไม่ใช่ปัญหาการเชื่อมต่อ');
  }

  const raw = JSON.stringify(responseData ?? {}).slice(0, 300);
  throw new Error(`รูปแบบคำตอบจาก provider ไม่ตรงตามที่คาด (ไม่มี choices[0].message.content) — ข้อมูลที่ได้: ${raw}`);
}

// ── Call provider แบบ OpenAI-compatible (custom provider ที่ user เพิ่มเอง) ──────
// ครอบคลุม Groq/OpenRouter/Together/Fireworks/DeepSeek/Ollama ฯลฯ เพราะใช้ POST
// {baseUrl}/chat/completions + Authorization: Bearer <apiKey> รูปแบบเดียวกันหมด
async function callOpenAiCompatible(prompt, { baseUrl, apiKey, model, name }) {
  const cleanUrl = sanitizeCredential(baseUrl);
  const cleanKey = sanitizeCredential(apiKey);
  const cleanModel = sanitizeCredential(model);
  const url = cleanUrl.replace(/\/+$/, '') + '/chat/completions';

  const response = await axios.post(
    url,
    {
      model: cleanModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
      temperature: 0.7,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cleanKey}`,
      },
    }
  );

  return {
    text: extractChatReply(response.data),
    modelLabel: name || model,
  };
}

// ── ทดสอบการเชื่อมต่อ custom AI provider — ส่ง prompt สั้นๆ ราคาถูก (max_tokens ต่ำ) ──────
// ใช้ตอนกดปุ่ม "ทดสอบ" ในฟอร์ม/รายการ provider เพื่อเช็คว่า Base URL/API Key/Model ถูกต้องไหม
// ก่อนเอาไปใช้จริงกับงานสรุปแชท — โยน error กลับไปให้ caller ตัดสินใจแสดงผลเอง
async function testAiProviderConnection({ baseUrl, apiKey, model }) {
  const cleanUrl = sanitizeCredential(baseUrl);
  const cleanKey = sanitizeCredential(apiKey);
  const cleanModel = sanitizeCredential(model);
  const url = cleanUrl.replace(/\/+$/, '') + '/chat/completions';
  const response = await axios.post(
    url,
    {
      model: cleanModel,
      messages: [{ role: 'user', content: 'ตอบกลับสั้นๆ แค่คำว่า "เชื่อมต่อสำเร็จ" คำเดียว ไม่ต้องอธิบายเพิ่ม' }],
      // ให้พอสำหรับ reasoning model ที่ใช้ token คิดก่อนตอบจริง (เช่น GLM/DeepSeek-R1) — 20 tokens
      // เดิมน้อยไปจนโดน finish_reason: "length" ก่อนจะได้ตอบ ทั้งที่ auth/URL/model ถูกต้องแล้ว
      max_tokens: 300,
      temperature: 0,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cleanKey}`,
      },
      timeout: 15000,
    }
  );
  return extractChatReply(response.data);
}

// ── ไล่เรียก provider ทีละตัวตามลำดับที่ให้มาจนกว่าจะสำเร็จ ─────────────────────
// ใช้กับ "โหมดอัตโนมัติ" (priority chain) — ทุก provider (Groq/Gemini/custom) เป็น config
// รูปแบบเดียวกันหมดแล้ว (OpenAI-compatible) เลยเรียก callOpenAiCompatible วนตามลำดับได้ตรงๆ
// providers: [{ name, baseUrl, apiKey, model }, ...] เรียงตาม priority ที่ต้องการลองก่อน-หลัง
async function callProviderChain(prompt, providers) {
  if (!providers || providers.length === 0) {
    throw new Error('ยังไม่มี AI provider ให้ใช้งาน — เพิ่มอย่างน้อย 1 ตัวก่อน');
  }
  let lastError;
  for (let i = 0; i < providers.length; i++) {
    try {
      const result = await callOpenAiCompatible(prompt, providers[i]);
      if (i > 0) result.modelLabel += ' (fallback)';
      return result;
    } catch (err) {
      lastError = err;
      const msg = err.response?.data?.error?.message || err.message;
      const nextNote = i < providers.length - 1 ? ` — ลองตัวถัดไป (${providers[i + 1].name})` : '';
      console.warn(`⚠️ ${providers[i].name} failed: ${msg}${nextNote}`);
    }
  }
  throw lastError;
}

// ── Main export ──────────────────────────────────────────────────────────────
// providerChain: array ของ [{ name, baseUrl, apiKey, model }, ...] เรียงตาม priority
// เลือกเจาะจง 1 ตัว = ส่ง array ที่มีสมาชิกเดียว (ไม่ fallback) — ผู้เรียก (routes/messages.js,
// botCommandService.js) เป็นคน resolve ว่าจะส่งทั้ง chain หรือตัวเดียวมาให้ฟังก์ชันนี้
async function summarizeAllChatsForDate(allMessages, providerChain) {
  try {
    if (allMessages.length === 0) {
      return { summary: 'ไม่มีข้อความในช่วงนี้', messageCount: 0, groupCount: 0 };
    }

    const { prompt, uniqueDayKeys, allGroupKeys, dateRangeLabel } = buildPrompt(allMessages);

    console.log(`📝 Summarizing with [${providerChain.map(p => p.name).join(' → ')}]: ${allMessages.length} msgs | ${uniqueDayKeys.length} day(s) | ${allGroupKeys.size} group(s)`);

    const result = await callProviderChain(prompt, providerChain);

    console.log(`✅ Summary generated by ${result.modelLabel}`);

    return {
      summary: result.text,
      messageCount: allMessages.length,
      groupCount: allGroupKeys.size,
      dayCount: uniqueDayKeys.length,
      dateRange: dateRangeLabel,
      model: result.modelLabel,
    };

  } catch (error) {
    console.error('❌ AI Error:', error.message);

    if (error.response?.status === 401) throw new Error('API Key ไม่ถูกต้อง ตรวจสอบ provider ที่เลือก');
    if (error.response?.status === 429) throw new Error('ใช้งาน API เกิน rate limit กรุณารอสักครู่แล้วลองใหม่');

    throw new Error(error.response?.data?.error?.message || error.message);
  }
}

// ── Vision: เรียก provider แบบ OpenAI-compatible ที่ user เพิ่มเอง+ติ๊ก "รองรับรูปภาพ" ──
// โครงเดียวกับ callOpenAiCompatible แต่ content เป็น multimodal (text + image_url) — ใช้เป็น
// fallback แทน Groq vision เดิม (โมเดล meta-llama/llama-4-scout-17b-16e-instruct ถูกถอดออกจาก
// Groq ไปแล้วจริงๆ ไม่ใช่แค่เปลี่ยนชื่อ — เช็คจาก /v1/models ตรงๆ พบว่าบัญชีนี้ไม่มีโมเดล vision เหลือ)
async function callOpenAiCompatibleVision(prompt, { baseUrl, apiKey, model, name }, imageBuffers) {
  const cleanUrl = sanitizeCredential(baseUrl);
  const cleanKey = sanitizeCredential(apiKey);
  const cleanModel = sanitizeCredential(model);
  const url = cleanUrl.replace(/\/+$/, '') + '/chat/completions';

  const content = [
    { type: 'text', text: prompt },
    ...imageBuffers.map(buf => ({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}` },
    })),
  ];

  const response = await axios.post(
    url,
    {
      model: cleanModel,
      messages: [{ role: 'user', content }],
      max_tokens: 4096,
      temperature: 0.1,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cleanKey}`,
      },
    }
  );

  return {
    text: extractChatReply(response.data),
    modelLabel: name || model,
  };
}

// ── ไล่เรียก provider vision ทีละตัวตามลำดับจนกว่าจะสำเร็จ (เหมือน callProviderChain แต่อ่านรูป) ──
async function callProviderChainVision(prompt, providers, imageBuffers) {
  if (!providers || providers.length === 0) {
    throw new Error('ยังไม่มี AI provider ที่รองรับรูปภาพ — เพิ่ม provider แล้วติ๊ก "รองรับรูปภาพ" ก่อน');
  }
  let lastError;
  for (let i = 0; i < providers.length; i++) {
    try {
      const result = await callOpenAiCompatibleVision(prompt, providers[i], imageBuffers);
      if (i > 0) result.modelLabel += ' (fallback)';
      return result;
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      // เก็บ error ที่มีรายละเอียดจริง (ชื่อ provider + สาเหตุจาก response body) แทนโยน axios error
      // ดิบๆ กลับไป — เดิม throw lastError (= err) ทำให้ .message กลายเป็นข้อความทั่วไปเช่น
      // "Request failed with status code 429" ซึ่งไม่บอกว่า provider ไหนพังหรือเพราะอะไร
      lastError = new Error(`${providers[i].name}: ${msg}`);
      const nextNote = i < providers.length - 1 ? ` — ลองตัวถัดไป (${providers[i + 1].name})` : '';
      console.warn(`⚠️ [vision] ${providers[i].name} failed: ${msg}${nextNote}`);
    }
  }
  throw lastError;
}

// ── Helper: ตัด markdown code fence ที่โมเดลชอบแถมมาออกก่อน JSON.parse ──────
function parseJsonFromModel(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

// ── Vision: อ่านรูป "รายงานตั้งเบิก" + "สกรีนธนาคาร" พร้อมกัน แล้วแกะเป็น JSON ──
// ไม่ต้องพึ่งลำดับการส่ง (ใครมาก่อน) — ให้ AI classify ประเภทของแต่ละรูปเองในตัว prompt เดียวกัน
async function extractPaymentDocuments(imageBufferA, imageBufferB, visionChain = []) {
  const prompt = `คุณเป็นผู้ช่วยตรวจสอบเอกสารการเงิน จะได้รับรูป 2 รูป เรียกว่า "ภาพ A" (รูปแรก) และ "ภาพ B" (รูปสอง) ไม่เรียงลำดับตายตัวว่าใบไหนคือรายงานหรือสกรีนธนาคาร ซึ่งเป็น:
1. "รายงานตั้งเบิกเงิน" — ตารางรายการที่ต้องจ่าย/โอน มีคอลัมน์ ผู้รับเงิน, เลขบัญชี/ธนาคาร, ยอดรวม, รหัสงาน
2. "สกรีนช็อตธนาคาร" (เช่น K BIZ) — ประวัติการโอนเงินจริง มีรายการ โอนเงิน/รับโอนเงิน พร้อมยอดและยอดคงเหลือในบัญชี

หน้าที่ของคุณ: ระบุว่าภาพ A และภาพ B แต่ละภาพเป็นประเภทไหน แล้วแกะข้อมูลออกมาเป็น JSON ตาม schema นี้เป๊ะๆ (ห้ามมีข้อความอื่นนอกจาก JSON, ห้ามใส่ markdown code fence):

{
  "imageAType": "requisition_report" หรือ "bank_statement" หรือ "unknown",
  "imageBType": "requisition_report" หรือ "bank_statement" หรือ "unknown",
  "reportItems": [
    { "docNo": "STN00580", "payee": "ชื่อผู้รับเงิน", "bankAccount": "เลขบัญชี", "bankName": "ชื่อธนาคาร", "amount": 776.00, "jobCode": "JS 26014", "description": "รายละเอียดสั้นๆ" }
  ],
  "bankItems": [
    { "time": "14:58:04", "direction": "out", "amount": 680.54, "counterName": "ชื่อ/รายละเอียดที่ขึ้นในรายการ", "counterAccount": "เลขบัญชีปลายทางถ้ามี", "balanceAfter": null }
  ],
  "bankEndingBalance": 54487.47
}

กติกา:
- "direction" ใน bankItems เป็น "out" สำหรับรายการโอนเงิน(ลบ) และ "in" สำหรับรับโอนเงิน(บวก)
- ถ้าอ่านตัวเลขไม่ชัดหรือไม่แน่ใจ ให้ใส่ค่าที่อ่านได้ดีที่สุด อย่าใส่ null ถ้าพอเดาได้จากบริบท
- "bankEndingBalance" คือยอดเงินคงเหลือล่าสุดที่แสดงในสกรีนธนาคาร (ถ้ามี)
- ถ้าไม่พบรูปแบบใดรูปแบบหนึ่ง (เช่นมีแต่รูปธนาคาร) ให้ array ของอีกฝั่งเป็น [] และ bankEndingBalance เป็น null`;

  const result = await callProviderChainVision(prompt, visionChain, [imageBufferA, imageBufferB]);

  console.log(`✅ Payment documents extracted by ${result.modelLabel}`);

  let parsed;
  try {
    parsed = parseJsonFromModel(result.text);
  } catch (e) {
    throw new Error(`อ่าน JSON จากผลลัพธ์ AI ไม่สำเร็จ: ${e.message}\n--- raw ---\n${result.text.slice(0, 500)}`);
  }

  return {
    imageAType: parsed.imageAType || 'unknown',
    imageBType: parsed.imageBType || 'unknown',
    reportItems: parsed.reportItems || [],
    bankItems: parsed.bankItems || [],
    bankEndingBalance: parsed.bankEndingBalance ?? null,
    model: result.modelLabel,
  };
}

// ── Matching: จับคู่รายการตั้งเบิก กับ รายการโอนจริงจากธนาคาร ────────────────
// เกณฑ์: จำนวนเงินต้องตรง (เผื่อ 0.01 บาทกันปัดเศษ) + ชื่อผู้รับ/เลขบัญชีคล้ายกันพอสมควร
// หมายเหตุ: reportItems อาจมีทั้งรายการจ่ายออก (ปกติ) และรายการรับเข้า (เช่น เงินยืมคืน)
// ปนกันอยู่ในตารางเดียว จึงเทียบกับ bankItems ทุกทิศทาง ไม่จำกัดแค่ direction = 'out'
// ส่วนการเช็ค "มีรายการโอนแปลกปลอมที่ไม่มีในรายงาน" (not_found_in_report) เช็คเฉพาะขาออกเท่านั้น
// เพราะเป็นความเสี่ยงจริง (เงินออกโดยไม่มีการขออนุมัติ) ต่างจากเงินเข้าที่ไม่ต้องขออนุมัติ
function normalizeForMatch(str) {
  return (str || '').toString().toLowerCase().replace(/[^a-z0-9ก-๙]/g, '');
}

function namesLikelyMatch(a, b) {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na) || na.slice(-4) === nb.slice(-4);
}

function matchPaymentItems(reportItems, bankItems) {
  const usedBankIdx = new Set();
  const matchResults = [];

  for (const reportItem of reportItems) {
    let matchIdx = -1;
    for (let i = 0; i < bankItems.length; i++) {
      if (usedBankIdx.has(i)) continue;
      const bankItem = bankItems[i];
      const amountMatches = Math.abs(Number(bankItem.amount) - Number(reportItem.amount)) < 0.01;
      if (!amountMatches) continue;

      const nameMatches =
        namesLikelyMatch(reportItem.payee, bankItem.counterName) ||
        namesLikelyMatch(reportItem.bankAccount, bankItem.counterAccount);

      const isOnlyAmountMatch = bankItems.filter((b, j) => !usedBankIdx.has(j) && Math.abs(Number(b.amount) - Number(reportItem.amount)) < 0.01).length === 1;

      if (nameMatches || isOnlyAmountMatch) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx >= 0) {
      usedBankIdx.add(matchIdx);
      matchResults.push({ reportItem, bankItem: bankItems[matchIdx], status: 'matched', note: '' });
    } else {
      matchResults.push({ reportItem, bankItem: null, status: 'not_found_in_bank', note: 'ไม่พบรายการโอนที่ยอดตรงกันในสลิปธนาคาร' });
    }
  }

  bankItems.forEach((bankItem, i) => {
    if (!usedBankIdx.has(i) && bankItem.direction === 'out') {
      matchResults.push({ reportItem: null, bankItem, status: 'not_found_in_report', note: 'มีรายการโอนเงินออกที่ไม่ตรงกับรายการตั้งเบิกใดเลย' });
    }
  });

  const overallStatus = matchResults.every(m => m.status === 'matched') ? 'matched' : 'has_mismatch';
  return { matchResults, overallStatus };
}

// ── คุยกับ AI ผู้ช่วยแบบ free-form (ไม่ผูกคำสั่งตายตัว) — ใช้ใน DM "AI ผู้ช่วย" ─────
// ใช้ compound-mini (มี web search ในตัว) เป็นหลักเสมอ เพราะคำถามแบบนี้อาจต้องการข้อมูลเรียลไทม์
// (เช่น ราคาหุ้นวันนี้) ที่โมเดลเปล่าไม่มีทางรู้ — เดาคำตอบเอง (hallucinate) ถ้าไม่มี tool ค้นเว็บ
// compound-mini เป็นโมเดลเฉพาะของ Groq ไม่ได้อยู่ใน priority-chain ที่ user จัดการเอง (ไม่มี provider
// อื่นมี web search ให้ทดแทน) — ถ้า compound-mini พัง (เช่นโดน rate limit) fallback ไปไล่ตาม
// fallbackChain ที่ผู้เรียกส่งมา (routes/messages.js resolve จาก priority-chain เดียวกับงานสรุปแชท)
// ถ้าไม่ส่งมาเลย fallback ไป llama-3.3-70b-versatile ของ Groq ตรงๆ เป็นค่า default กันพลาด
async function askQuestion(question, fallbackChain = []) {
  const searchPrompt = `คุณเป็นผู้ช่วย AI ของทีมงานในระบบแชท LINE OA ตอบคำถามเป็นภาษาไทย กระชับ ชัดเจน
ถ้าคำถามต้องการข้อมูลล่าสุด/เรียลไทม์ (เช่น ราคาหุ้น อัตราแลกเปลี่ยน ข่าว สภาพอากาศ) ให้ค้นเว็บจริง
แล้วตอบเป็นตัวเลข/ข้อมูลจริงที่ค้นเจอเท่านั้น ห้ามใส่ placeholder หรือสัญลักษณ์แทนตัวเลข (เช่น XXXX.XX)
เด็ดขาด ถ้าค้นแล้วหาคำตอบที่แน่ชัดไม่ได้จริงๆ ให้บอกตรงๆ ว่าหาไม่เจอ แทนที่จะเดาหรือใส่ค่าตัวอย่าง

คำถาม: ${question}`;

  // prompt แยกสำหรับตอน fallback — โมเดลนี้ไม่มี web search จริงๆ การสั่ง "ค้นเว็บ" แบบ searchPrompt
  // กับโมเดลนี้ทำให้มันเข้าใจผิดว่าตัวเองค้นได้ แล้วมั่วตัวเลข+อ้างแหล่งข้อมูลปลอม (พบตอนทดสอบจริง)
  // ต้องบอกตรงๆ ว่าไม่มีเน็ต ห้ามเดา ให้ปฏิเสธคำถามที่ต้องการข้อมูลเรียลไทม์ไปเลย
  const noSearchPrompt = `คุณเป็นผู้ช่วย AI ของทีมงานในระบบแชท LINE OA ตอบคำถามเป็นภาษาไทย กระชับ ชัดเจน
คุณไม่มีการเชื่อมต่ออินเทอร์เน็ตและไม่สามารถค้นข้อมูลใดๆ ได้เลยในตอนนี้ ถ้าคำถามต้องการข้อมูลล่าสุด/
เรียลไทม์ (เช่น ราคาหุ้น อัตราแลกเปลี่ยน ข่าว สภาพอากาศ หรือเหตุการณ์ปัจจุบัน) ให้ตอบตรงๆ ว่า "ตอนนี้ระบบ
ค้นข้อมูลเรียลไทม์ขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง" ห้ามเดาตัวเลขหรืออ้างอิงแหล่งข้อมูลที่ไม่ได้ค้น
จริงเด็ดขาด ส่วนคำถามทั่วไปที่ไม่ต้องการข้อมูลเรียลไทม์ ตอบได้ตามปกติ

คำถาม: ${question}`;

  try {
    let result;
    try {
      result = await callGroq(searchPrompt, 'groq/compound-mini');
    } catch (primaryError) {
      console.warn(`⚠️ compound-mini failed: ${primaryError.message} — falling back (ไม่มี web search)`);
      if (fallbackChain.length > 0) {
        result = await callProviderChain(noSearchPrompt, fallbackChain);
      } else {
        result = await callGroq(noSearchPrompt);
      }
      result.modelLabel += ' (fallback, ไม่มี web search)';
    }
    return { text: result.text, model: result.modelLabel };
  } catch (error) {
    console.error('❌ AI Error:', error.message);
    if (error.response?.status === 401) throw new Error('API Key ไม่ถูกต้อง ตรวจสอบใน .env');
    if (error.response?.status === 429) throw new Error('ใช้งาน API เกิน rate limit กรุณารอสักครู่แล้วลองใหม่ (โมเดล compound-mini มี rate limit ต่ำกว่าโมเดลปกติ)');
    throw new Error(error.response?.data?.error?.message || error.message);
  }
}

// ── Vision: อ่านรูปใบเสร็จ/บิลซื้อของ (1-10 รูป ของใบเดียวกัน) แล้วแกะเป็น JSON ──
// รูปหลายใบถือเป็นบิลเดียวกันเสมอ (เช่นถ่ายแยกเพราะบิลยาว) — รวมรายการจากทุกรูปเป็นก้อนเดียว
async function extractReceiptSummary(imageBuffers, visionChain = []) {
  const prompt = `คุณเป็นผู้ช่วยอ่านใบเสร็จ/บิลซื้อของ จะได้รับรูป ${imageBuffers.length} รูป ซึ่งเป็นใบเสร็จใบเดียวกัน (อาจถ่ายหลายรูปเพราะบิลยาวหรือมีหลายหน้า) ให้รวมข้อมูลจากทุกรูปเป็นรายการเดียว แล้วแกะข้อมูลออกมาเป็น JSON ตาม schema นี้เป๊ะๆ (ห้ามมีข้อความอื่นนอกจาก JSON, ห้ามใส่ markdown code fence):

{
  "storeName": "ชื่อร้านค้า/ผู้ขายตามที่ปรากฏในบิล",
  "purchaseDate": "วันที่ซื้อ รูปแบบ D/M/YY แบบ พ.ศ. เช่น 8/7/69",
  "items": ["ชื่อสินค้ารายการที่ 1", "ชื่อสินค้ารายการที่ 2"],
  "totalAmount": 1305.00
}

กติกา:
- "items" ต้องมีครบทุกรายการสินค้าที่อยู่ในบิล ห้ามตัดทอนหรือสรุปรวมรายการเข้าด้วยกัน
- "totalAmount" คือยอดรวมสุทธิที่ต้องจ่ายจริง (grand total / ยอดชำระ) ไม่ใช่ยอดก่อนหักส่วนลดหรือก่อนภาษี
- ถ้ารูปที่ส่งมาไม่ใช่ใบเสร็จ/บิลซื้อของเลย ให้ storeName เป็น null และ items เป็น []`;

  const result = await callProviderChainVision(prompt, visionChain, imageBuffers);

  console.log(`✅ Receipt summary extracted by ${result.modelLabel}`);

  let parsed;
  try {
    parsed = parseJsonFromModel(result.text);
  } catch (e) {
    throw new Error(`อ่าน JSON จากผลลัพธ์ AI ไม่สำเร็จ: ${e.message}\n--- raw ---\n${result.text.slice(0, 500)}`);
  }

  return {
    storeName: parsed.storeName || null,
    purchaseDate: parsed.purchaseDate || null,
    items: Array.isArray(parsed.items) ? parsed.items : [],
    totalAmount: Number(parsed.totalAmount) || 0,
    model: result.modelLabel,
  };
}

// ── Vision: อ่านสลิปโอนเงิน (1-2 รูป ของธุรกรรมเดียวกัน) สำหรับฟีเจอร์ "เช็คยอดสมุดบัญชี" ──
// ต่างจาก extractPaymentDocuments (รายงานตั้งเบิก vs สกรีนธนาคาร) — อันนี้อ่านแค่สลิปโอนเงินเดี่ยวๆ
// แล้วให้ AI ตัดสิน direction (ยืม/คืน) เองโดยเทียบชื่อ referenceName กับฝั่ง "จาก"/"ถึง" บนสลิป —
// ถ้าหาไม่เจอ ต้องคืน direction: null ให้ webhook.js ปฏิเสธไม่สร้าง entry (ห้ามเดาทิศทางเงินเด็ดขาด
// เพราะทิศทางผิดจะทำให้ยอดคงเหลือเพี้ยนสะสมไปทุกรายการถัดไป)
async function extractTransferSlip(imageBuffers, visionChain = [], referenceName = '') {
  const prompt = `คุณเป็นผู้ช่วยอ่านสลิปโอนเงิน (เช่น K PLUS "โอนเงินสำเร็จ") จะได้รับรูป ${imageBuffers.length} รูป ซึ่งเป็นสลิปของธุรกรรมเดียวกัน (อาจถ่ายแยกเป็นหลายรูป) แกะข้อมูลออกมาเป็น JSON ตาม schema นี้เป๊ะๆ (ห้ามมีข้อความอื่นนอกจาก JSON, ห้ามใส่ markdown code fence):

{
  "amount": 50000.00,
  "occurredAt": "18/07/69 10:04" (วันที่-เวลาบนสลิป ตามที่ปรากฏ, null ถ้าอ่านไม่ได้),
  "fromName": "ชื่อผู้โอน (ฝั่ง จาก) ตามที่ปรากฏบนสลิป",
  "fromAccount": "เลขบัญชีผู้โอน ถ้ามี (อาจมีการปิดบางส่วน)",
  "toName": "ชื่อผู้รับ (ฝั่ง ถึง) ตามที่ปรากฏบนสลิป",
  "toAccount": "เลขบัญชีผู้รับ ถ้ามี",
  "refNumber": "เลขที่รายการ ถ้ามี",
  "direction": "in" หรือ "out" หรือ null,
  "referenceNameMatched": "from" หรือ "to" หรือ null,
  "note": "อธิบายสั้นๆ ถ้า direction เป็น null ว่าทำไมตัดสินไม่ได้"
}

กติกาการตัดสิน direction — สำคัญมาก ห้ามเดาถ้าไม่แน่ใจ:
- ชื่ออ้างอิงที่ต้องเทียบคือ "${referenceName}"
- ถ้าชื่อนี้ (หรือชื่อที่สะกด/เขียนคล้ายกันมาก) ปรากฏอยู่ฝั่ง "จาก" (fromName) → direction = "in", referenceNameMatched = "from"
- ถ้าชื่อนี้ปรากฏอยู่ฝั่ง "ถึง" (toName) → direction = "out", referenceNameMatched = "to"
- ถ้าหาชื่อนี้ไม่เจอในทั้ง 2 ฝั่งเลย หรือไม่แน่ใจ → direction = null, referenceNameMatched = null (ห้ามเดา)
- ถ้าอ่านตัวเลข amount ไม่ชัด ให้ใส่ค่าที่อ่านได้ดีที่สุด อย่าใส่ null ถ้าพอเดาได้จากบริบท`;

  const result = await callProviderChainVision(prompt, visionChain, imageBuffers);

  console.log(`✅ Transfer slip extracted by ${result.modelLabel}`);

  let parsed;
  try {
    parsed = parseJsonFromModel(result.text);
  } catch (e) {
    throw new Error(`อ่าน JSON จากผลลัพธ์ AI ไม่สำเร็จ: ${e.message}\n--- raw ---\n${result.text.slice(0, 500)}`);
  }

  return {
    amount: Number(parsed.amount) || 0,
    occurredAt: parsed.occurredAt || null,
    fromName: parsed.fromName || null,
    fromAccount: parsed.fromAccount || null,
    toName: parsed.toName || null,
    toAccount: parsed.toAccount || null,
    refNumber: parsed.refNumber || null,
    direction: parsed.direction === 'in' || parsed.direction === 'out' ? parsed.direction : null,
    referenceNameMatched: parsed.referenceNameMatched === 'from' || parsed.referenceNameMatched === 'to' ? parsed.referenceNameMatched : null,
    note: parsed.note || null,
    model: result.modelLabel,
  };
}

// ── Vision: อ่านยอด "คงเหลือ" แถวล่างสุดในรูปสมุดบัญชีที่เขียนด้วยมือ (1 รูป) ──────────────
// ใช้ทั้งตอนตั้งยอดเริ่มต้น (seed, ยังไม่มี entry ไหนในระบบเลย) และตอนเช็คยอดย้อนหลัง (คำสั่ง "เช็คสมุด")
async function extractWrittenBalance(imageBuffer, visionChain = []) {
  const prompt = `คุณเป็นผู้ช่วยอ่านสมุดบัญชีที่เขียนด้วยลายมือ มีคอลัมน์ วัน-เดือน-ปี, รายการ, รับ, จ่าย, คงเหลือ อ่านตัวเลขในคอลัมน์ "คงเหลือ" ของแถวล่างสุดที่มีการเขียนไว้ (แถวสุดท้ายที่มีข้อมูล ไม่ใช่แถวว่าง) คืนเป็น JSON ตาม schema นี้เป๊ะๆ (ห้ามมีข้อความอื่นนอกจาก JSON, ห้ามใส่ markdown code fence):

{
  "balance": 12345.00,
  "rowDate": "วันที่ของแถวนั้นตามที่เขียนไว้ ถ้าอ่านได้",
  "confident": true หรือ false
}

กติกา:
- ถ้าลายมืออ่านยากจนไม่มั่นใจ ให้ confident: false แต่ยังคงต้องใส่ตัวเลขที่อ่านได้ดีที่สุดใน balance (ห้ามใส่ null)
- อ่านเฉพาะแถวล่างสุดที่มีตัวเลขเขียนไว้จริงเท่านั้น อย่าอ่านแถวว่างที่ยังไม่มีการกรอก`;

  const result = await callProviderChainVision(prompt, visionChain, [imageBuffer]);

  console.log(`✅ Written balance extracted by ${result.modelLabel}`);

  let parsed;
  try {
    parsed = parseJsonFromModel(result.text);
  } catch (e) {
    throw new Error(`อ่าน JSON จากผลลัพธ์ AI ไม่สำเร็จ: ${e.message}\n--- raw ---\n${result.text.slice(0, 500)}`);
  }

  return {
    balance: Number(parsed.balance) || 0,
    rowDate: parsed.rowDate || null,
    confident: parsed.confident !== false,
    model: result.modelLabel,
  };
}

module.exports = {
  summarizeAllChatsForDate,
  extractPaymentDocuments,
  matchPaymentItems,
  askQuestion,
  extractReceiptSummary,
  testAiProviderConnection,
  sanitizeCredential,
  callProviderChain,
  callProviderChainVision,
  extractTransferSlip,
  extractWrittenBalance,
};
