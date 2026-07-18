// routes/aiProviders.js — จัดการ AI provider ทุกตัวในระบบ (ทั้ง built-in ที่ seed จาก .env เช่น
// Groq/Gemini และตัวที่ user เพิ่มเอง เช่น OpenRouter) รวมเป็นระบบเดียวกันหมด — ทุกตัวแก้ไข/ลบ/
// ทดสอบ/จัดลำดับความสำคัญได้เหมือนกัน ไม่มีการแยกพิเศษอีกต่อไป (ดู isBuiltIn ใน AiProvider.js)
// รองรับเฉพาะ endpoint แบบ OpenAI-compatible (base URL + API key + ชื่อ model)
// GET เปิดให้ทุก role ที่ login แล้วเห็น (ใช้เลือกใน dropdown สรุป AI) — key จะถูก mask เสมอ
// POST/PUT/PATCH/DELETE จำกัดเฉพาะ superuser เท่านั้น เพราะเป็นข้อมูลสิทธิ์ระดับ API key
const express = require('express');
const router = express.Router();
const { AiProvider } = require('../models/index');
const { testAiProviderConnection, sanitizeCredential } = require('../services/aiService');
const authMiddleware = require('../middleware/auth');
const { requireSuperuser } = require('../middleware/auth');

router.use(authMiddleware);

// ปกปิด API key ตอนส่งกลับ frontend — เหลือให้ดูแค่ต้น-ท้ายพอยืนยันว่าใช่ตัวไหน
function maskKey(key) {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

function serialize(p) {
  return {
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    model: p.model,
    apiKeyMasked: maskKey(p.apiKey),
    priority: p.priority,
    isBuiltIn: p.isBuiltIn,
    createdAt: p.createdAt,
  };
}

// GET /api/ai-providers — รายการ provider ทั้งหมด เรียงตามลำดับความสำคัญ (key ถูก mask)
router.get('/', async (req, res) => {
  try {
    const providers = await AiProvider.findAll({ order: [['priority', 'ASC']] });
    res.json(providers.map(serialize));
  } catch (err) {
    console.error('[ERROR] GET /api/ai-providers:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai-providers — เพิ่ม provider ใหม่ (เข้าไปเป็นลำดับท้ายสุดเสมอ — ยังไม่เคยพิสูจน์ว่าใช้ได้)
// body: { name, baseUrl, apiKey, model }
router.post('/', requireSuperuser, async (req, res) => {
  try {
    const { name, baseUrl, apiKey, model } = req.body;
    if (!name?.trim() || !baseUrl?.trim() || !apiKey?.trim() || !model?.trim()) {
      return res.status(400).json({ error: 'ต้องระบุ ชื่อ, Base URL, API Key และชื่อ Model ให้ครบ' });
    }
    const count = await AiProvider.count();
    const provider = await AiProvider.create({
      name: sanitizeCredential(name),
      baseUrl: sanitizeCredential(baseUrl).replace(/\/+$/, ''),
      apiKey: sanitizeCredential(apiKey),
      model: sanitizeCredential(model),
      priority: count + 1,
      createdBy: req.admin.id,
    });
    res.json(serialize(provider));
  } catch (err) {
    console.error('[ERROR] POST /api/ai-providers:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/ai-providers/:id — แก้ไข provider เดิม (ไม่แตะลำดับความสำคัญ — ใช้ PATCH /priority แยก)
// apiKey ส่งมาว่าง/ไม่ส่งมา = ไม่เปลี่ยน คงคีย์เดิมไว้ (frontend ไม่มีทางรู้คีย์เต็มอยู่แล้วเพราะถูก mask)
router.put('/:id', requireSuperuser, async (req, res) => {
  try {
    const provider = await AiProvider.findByPk(req.params.id);
    if (!provider) return res.status(404).json({ error: 'ไม่พบ provider นี้' });

    const { name, baseUrl, apiKey, model } = req.body;
    if (!name?.trim() || !baseUrl?.trim() || !model?.trim()) {
      return res.status(400).json({ error: 'ต้องระบุ ชื่อ, Base URL และชื่อ Model ให้ครบ' });
    }

    provider.name = sanitizeCredential(name);
    provider.baseUrl = sanitizeCredential(baseUrl).replace(/\/+$/, '');
    provider.model = sanitizeCredential(model);
    if (apiKey?.trim()) provider.apiKey = sanitizeCredential(apiKey);

    await provider.save();
    res.json(serialize(provider));
  } catch (err) {
    console.error('[ERROR] PUT /api/ai-providers/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/ai-providers/:id/priority — จัดลำดับความสำคัญด้วยการพิมพ์เลขใหม่ตรงๆ
// พฤติกรรม: "สลับตำแหน่งตรงๆ" กับตัวที่ถือเลขนั้นอยู่เดิม (ตัวอื่นในลิสต์ไม่กระทบเลย) — ตามที่ตกลงกันไว้
// body: { priority: <เลขใหม่ 1..จำนวน provider ทั้งหมด> } — เลขนอกช่วงจะถูก clamp ให้อยู่ในช่วงที่ถูกต้อง
router.patch('/:id/priority', requireSuperuser, async (req, res) => {
  try {
    const provider = await AiProvider.findByPk(req.params.id);
    if (!provider) return res.status(404).json({ error: 'ไม่พบ provider นี้' });

    const total = await AiProvider.count();
    let newPriority = parseInt(req.body.priority, 10);
    if (!Number.isInteger(newPriority)) {
      return res.status(400).json({ error: 'ลำดับต้องเป็นตัวเลข' });
    }
    newPriority = Math.min(Math.max(newPriority, 1), total);

    if (newPriority !== provider.priority) {
      const holder = await AiProvider.findOne({ where: { priority: newPriority } });
      const oldPriority = provider.priority;
      if (holder) await holder.update({ priority: oldPriority });
      await provider.update({ priority: newPriority });
    }

    const all = await AiProvider.findAll({ order: [['priority', 'ASC']] });
    res.json(all.map(serialize));
  } catch (err) {
    console.error('[ERROR] PATCH /api/ai-providers/:id/priority:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai-providers/test — ทดสอบการเชื่อมต่อ ก่อน/หลังบันทึกก็ได้
// body: { id } ทดสอบ provider ที่บันทึกไว้แล้ว, หรือ { baseUrl, apiKey, model } ทดสอบค่าที่ยังไม่บันทึก
// ถ้าส่ง id มาด้วยพร้อม apiKey ใหม่ (ตอนกำลังแก้ไข) จะ override เฉพาะ apiKey ส่วน baseUrl/model อื่นใช้ของเดิมถ้าไม่ส่งมา
router.post('/test', requireSuperuser, async (req, res) => {
  try {
    let { id, baseUrl, apiKey, model } = req.body;
    if (id) {
      const provider = await AiProvider.findByPk(id);
      if (!provider) return res.status(404).json({ error: 'ไม่พบ provider นี้' });
      baseUrl = (baseUrl && baseUrl.trim()) || provider.baseUrl;
      model = (model && model.trim()) || provider.model;
      apiKey = (apiKey && apiKey.trim()) || provider.apiKey;
    }
    if (!baseUrl?.trim() || !apiKey?.trim() || !model?.trim()) {
      return res.status(400).json({ error: 'ต้องระบุ Base URL, API Key และ Model ก่อนทดสอบ' });
    }
    const reply = await testAiProviderConnection({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() });
    res.json({ ok: true, reply });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    res.json({ ok: false, error: msg });
  }
});

// DELETE /api/ai-providers/:id — ลบ provider แล้วปิดช่องว่างลำดับที่เหลือให้เป็น 1..N ต่อเนื่องเสมอ
router.delete('/:id', requireSuperuser, async (req, res) => {
  try {
    const provider = await AiProvider.findByPk(req.params.id);
    if (!provider) return res.status(404).json({ error: 'ไม่พบ provider นี้' });
    await provider.destroy();

    const remaining = await AiProvider.findAll({ order: [['priority', 'ASC']] });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].priority !== i + 1) await remaining[i].update({ priority: i + 1 });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[ERROR] DELETE /api/ai-providers/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
