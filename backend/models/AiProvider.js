// สร้างตาราง AiProviders — เก็บ AI provider ทุกตัวที่ระบบใช้ได้ ทั้งที่ user เพิ่มเอง (เช่น OpenRouter)
// และตัว built-in เดิม (Groq/Gemini) ที่ seed มาจาก .env ตอน server เริ่มทำงานครั้งแรก (ดู server.js)
// รวมเป็นระบบเดียวกันหมดเพราะทุกเจ้ารองรับ endpoint แบบ OpenAI-compatible (POST {baseUrl}/chat/completions)
// รวมถึง Gemini เองด้วย (ผ่าน endpoint compat ของ Google: /v1beta/openai) — ดู aiService.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AiProvider = sequelize.define('AiProvider', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  // ชื่อที่แสดงใน dropdown/รายการ เช่น "DeepSeek V3", "Groq — Llama 3.3 70B"
  name: { type: DataTypes.STRING, allowNull: false },
  // Base URL ไม่รวม /chat/completions เช่น https://api.deepseek.com/v1
  baseUrl: { type: DataTypes.STRING, allowNull: false },
  // API key ของ provider นั้น — ส่งเป็น Authorization: Bearer <apiKey>
  apiKey: { type: DataTypes.STRING, allowNull: false },
  // ชื่อ model ตามที่ provider กำหนด เช่น deepseek-chat
  model: { type: DataTypes.STRING, allowNull: false },
  // ลำดับความสำคัญ — เลขน้อย = ลองก่อน โหมด "อัตโนมัติ" ไล่ตามเลขนี้จนกว่าจะสำเร็จ
  priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 999 },
  // true เฉพาะแถวที่ seed มาจาก .env (Groq/Gemini) — ใช้กันไม่ให้ seed ซ้ำตอน restart เท่านั้น
  // ไม่ได้ใช้จำกัดสิทธิ์แก้ไข/ลบ — superuser แก้/ลบตัวนี้ได้เหมือนตัว custom ทุกอย่าง
  isBuiltIn: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // admin คนที่เพิ่ม provider นี้ (เก็บไว้อ้างอิงเฉยๆ ไม่ได้ใช้ผูกสิทธิ์)
  createdBy: { type: DataTypes.UUID, allowNull: true },
}, { timestamps: true });

module.exports = AiProvider;
