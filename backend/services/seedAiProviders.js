// seedAiProviders.js — ดึงค่า Groq/Gemini จาก .env มาสร้างเป็นแถวใน AiProviders ตอน server เริ่มทำงาน
// ครั้งแรกเท่านั้น (เช็คด้วย isBuiltIn — ถ้าเคย seed แล้วจะไม่ seed ซ้ำ แม้ user จะลบทิ้งไปแล้วก็ตาม
// เพราะถือว่าเป็นการตั้งใจลบ) ทำให้ Groq/Gemini กลายเป็น provider ธรรมดาที่แก้ไข/ลบ/จัดลำดับได้
// เหมือน custom provider ทุกอย่าง ไม่ต้อง hardcode แยกอีกต่อไป
const { AiProvider } = require('../models');

async function seedBuiltInAiProviders() {
  // แถวเดิม (ก่อนมี priority) ทั้งหมดจะมีค่า default 999 — จัดให้เรียงตาม id ก่อน (ลำดับที่เพิ่มมาเดิม)
  // ก่อน seed built-in ต่อท้าย กันไม่ให้ Groq/Gemini แทรกกลางลำดับที่ user เคยจัดไว้
  const unranked = await AiProvider.findAll({ where: { priority: 999 }, order: [['id', 'ASC']] });
  if (unranked.length > 0) {
    const ranked = await AiProvider.findAll({ where: {}, order: [['priority', 'ASC']] });
    let next = ranked.filter((p) => p.priority !== 999).length + 1;
    for (const p of unranked) {
      await p.update({ priority: next++ });
    }
  }

  const alreadySeeded = await AiProvider.count({ where: { isBuiltIn: true } });
  if (alreadySeeded > 0) return;

  const maxPriority = (await AiProvider.max('priority')) || 0;
  let nextPriority = maxPriority + 1;

  if (process.env.GROQ_API_KEY) {
    await AiProvider.create({
      name: 'Groq — Llama 3.3 70B',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY,
      model: 'llama-3.3-70b-versatile',
      priority: nextPriority++,
      isBuiltIn: true,
    });
    console.log('🌱 Seeded built-in provider: Groq — Llama 3.3 70B');
  }

  // Gemini ใช้ endpoint OpenAI-compatible ของ Google (https://ai.google.dev/gemini-api/docs/openai)
  // ต่อท้ายสุดโดยตั้งใจ เพราะโปรเจกต์นี้เคยเจอปัญหา key ไม่มี quota (ไม่ผูก billing) มาก่อน — ถ้าจะ
  // ใช้จริงต้องแก้ billing แล้วขยับลำดับเองทีหลัง ไม่ควรเป็นตัวแรกที่ระบบลองโดยไม่รู้ตัว
  if (process.env.GEMINI_API_KEY) {
    await AiProvider.create({
      name: 'Gemini — Flash 2.0',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: process.env.GEMINI_API_KEY,
      model: 'gemini-2.0-flash',
      priority: nextPriority++,
      isBuiltIn: true,
    });
    console.log('🌱 Seeded built-in provider: Gemini — Flash 2.0');
  }
}

module.exports = { seedBuiltInAiProviders };
