
const axios = require('axios');

// ── Groq ────────────────────────────────────────────────────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'; // ต้อง vision-capable — เช็ค model ล่าสุดที่ console.groq.com ถ้า error "model not found"
const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';

// ── Gemini ──────────────────────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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

// ── Call Gemini ──────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY ยังไม่ได้ตั้งค่าใน .env');

  try {
    const response = await axios.post(
      `${GEMINI_API}?key=${GEMINI_API_KEY}`,
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    return {
      text: response.data.candidates[0].content.parts[0].text,
      modelLabel: `Gemini ${GEMINI_MODEL}`,
    };
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.error?.message || err.message;
    console.error(`❌ Gemini API error [${status}]:`, msg);
    console.error('Key prefix:', GEMINI_API_KEY?.slice(0, 10) + '...');
    throw err;
  }
}

// ── Main export ──────────────────────────────────────────────────────────────
async function summarizeAllChatsForDate(allMessages, provider = 'groq') {
  try {
    if (allMessages.length === 0) {
      return { summary: 'ไม่มีข้อความในช่วงนี้', messageCount: 0, groupCount: 0 };
    }

    const { prompt, uniqueDayKeys, allGroupKeys, dateRangeLabel } = buildPrompt(allMessages);

    console.log(`📝 Summarizing with ${provider === 'gemini' ? 'Gemini' : 'Groq'}: ${allMessages.length} msgs | ${uniqueDayKeys.length} day(s) | ${allGroupKeys.size} group(s)`);

    let result;
    try {
      result = provider === 'gemini' ? await callGemini(prompt) : await callGroq(prompt);
    } catch (primaryError) {
      // Fallback to the other provider if primary fails
      const fallback = provider === 'gemini' ? 'groq' : 'gemini';
      console.warn(`⚠️ ${provider} failed: ${primaryError.message} — trying ${fallback} as fallback`);
      result = fallback === 'gemini' ? await callGemini(prompt) : await callGroq(prompt);
      result.modelLabel += ' (fallback)';
    }

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

    if (error.response?.status === 401) throw new Error('API Key ไม่ถูกต้อง ตรวจสอบใน .env');
    if (error.response?.status === 429) throw new Error('ใช้งาน API เกิน rate limit กรุณารอสักครู่แล้วลองใหม่');

    throw new Error(error.response?.data?.error?.message || error.message);
  }
}

// ── Vision: เรียก Gemini อ่านรูป ─────────────────────────────────────────────
async function callGeminiVision(prompt, imageBuffers) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY ยังไม่ได้ตั้งค่าใน .env');

  const parts = [
    { text: prompt },
    ...imageBuffers.map(buf => ({
      inlineData: { mimeType: 'image/jpeg', data: buf.toString('base64') },
    })),
  ];

  try {
    const response = await axios.post(
      `${GEMINI_API}?key=${GEMINI_API_KEY}`,
      {
        contents: [{ role: 'user', parts }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.1 },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    return {
      text: response.data.candidates[0].content.parts[0].text,
      modelLabel: `Gemini ${GEMINI_MODEL} (vision)`,
    };
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.error?.message || err.message;
    console.error(`❌ Gemini Vision API error [${status}]:`, msg);
    throw err;
  }
}

// ── Vision: เรียก Groq อ่านรูป (fallback) ────────────────────────────────────
async function callGroqVision(prompt, imageBuffers) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY ยังไม่ได้ตั้งค่าใน .env');

  const content = [
    { type: 'text', text: prompt },
    ...imageBuffers.map(buf => ({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}` },
    })),
  ];

  const response = await axios.post(
    GROQ_API,
    {
      model: GROQ_VISION_MODEL,
      messages: [{ role: 'user', content }],
      max_tokens: 4096,
      temperature: 0.1,
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
    modelLabel: 'Llama 4 Scout (Groq vision)',
  };
}

// ── Helper: ตัด markdown code fence ที่โมเดลชอบแถมมาออกก่อน JSON.parse ──────
function parseJsonFromModel(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

// ── Vision: อ่านรูป "รายงานตั้งเบิก" + "สกรีนธนาคาร" พร้อมกัน แล้วแกะเป็น JSON ──
// ไม่ต้องพึ่งลำดับการส่ง (ใครมาก่อน) — ให้ AI classify ประเภทของแต่ละรูปเองในตัว prompt เดียวกัน
async function extractPaymentDocuments(imageBufferA, imageBufferB) {
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

  let result;
  try {
    result = await callGeminiVision(prompt, [imageBufferA, imageBufferB]);
  } catch (primaryError) {
    console.warn(`⚠️ Gemini vision failed: ${primaryError.message} — ลองใช้ Groq vision แทน`);
    result = await callGroqVision(prompt, [imageBufferA, imageBufferB]);
    result.modelLabel += ' (fallback)';
  }

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
// ใช้ compound-mini (มี web search ในตัว) เป็นหลัก เพราะคำถามแบบนี้อาจต้องการข้อมูลเรียลไทม์
// (เช่น ราคาหุ้นวันนี้) ที่โมเดลเปล่าไม่มีทางรู้ — เดาคำตอบเอง (hallucinate) ถ้าไม่มี tool ค้นเว็บ
// ถ้า compound-mini โดน rate limit (มี quota ต่ำกว่าโมเดลปกติเพราะต้องค้นเว็บจริงทุกครั้ง) → fallback
// ไปใช้ llama-3.3-70b-versatile ของ Groq เอง (เจ้าเดียวกัน เชื่อถือได้กว่า) แทนที่จะสลับไป Gemini
// ซึ่งโปรเจกต์นี้โควต้า = 0 อยู่แล้ว (ไม่เคยผูก billing) จะพังซ้ำแน่ๆ
async function askQuestion(question) {
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
      console.warn(`⚠️ compound-mini failed: ${primaryError.message} — falling back to llama-3.3-70b-versatile (ไม่มี web search)`);
      result = await callGroq(noSearchPrompt);
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
async function extractReceiptSummary(imageBuffers) {
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

  let result;
  try {
    result = await callGeminiVision(prompt, imageBuffers);
  } catch (primaryError) {
    console.warn(`⚠️ Gemini vision failed: ${primaryError.message} — ลองใช้ Groq vision แทน`);
    result = await callGroqVision(prompt, imageBuffers);
    result.modelLabel += ' (fallback)';
  }

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

module.exports = {
  summarizeAllChatsForDate,
  extractPaymentDocuments,
  matchPaymentItems,
  askQuestion,
  extractReceiptSummary,
};
