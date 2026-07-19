// Data Browser — ดู DB table ทั้งหมดแบบ read-only เฉพาะ superuser
// รวมทุก model ที่มีใน models/index.js ไว้ที่เดียว ตัดคอลัมน์อ่อนไหว (password/apiKey) ออกเสมอ
// ไม่มี route เขียน/แก้/ลบใดๆ ทั้งสิ้น — ใช้เพื่อ "ดู" ข้อมูลเท่านั้น
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { requireSuperuser } = require('../middleware/auth');
const {
  User, Group, Message, Admin, AdminGroup, Label, GroupLabel, Setting,
  PaymentVerification, AccountLedgerEntry, AiProvider, LedgerBalanceEntry,
} = require('../models/index');

router.use(authMiddleware, requireSuperuser);

// key = ใช้ใน URL, label = ชื่อแสดงผลภาษาไทย, exclude = คอลัมน์ที่ตัดออกเสมอ (ข้อมูลอ่อนไหว)
const TABLES = {
  users: { model: User, label: 'ผู้ใช้ LINE (User)', exclude: [] },
  admins: { model: Admin, label: 'แอดมิน/ผู้ใช้ระบบ (Admin)', exclude: ['password'] },
  groups: { model: Group, label: 'กลุ่ม LINE (Group)', exclude: [] },
  messages: { model: Message, label: 'ข้อความ (Message)', exclude: [] },
  adminGroups: { model: AdminGroup, label: 'สิทธิ์กลุ่มต่อแอดมิน (AdminGroup)', exclude: [] },
  labels: { model: Label, label: 'ป้ายกำกับ (Label)', exclude: [] },
  groupLabels: { model: GroupLabel, label: 'ผูกป้าย-กลุ่ม (GroupLabel)', exclude: [] },
  settings: { model: Setting, label: 'ตั้งค่าระบบ (Setting)', exclude: [] },
  paymentVerifications: { model: PaymentVerification, label: 'ตรวจสอบการโอน-ตั้งเบิก (PaymentVerification)', exclude: [] },
  accountLedgerEntries: { model: AccountLedgerEntry, label: 'บัญชีแยกประเภท (AccountLedgerEntry)', exclude: [] },
  aiProviders: { model: AiProvider, label: 'AI Providers', exclude: ['apiKey'] },
  ledgerBalanceEntries: { model: LedgerBalanceEntry, label: 'เช็คยอดสมุดบัญชี (LedgerBalanceEntry)', exclude: [] },
};

const PAGE_SIZE = 50;

// ชื่อ model ของ Sequelize (เช่น "Group") → key ที่ใช้ใน URL ของเรา (เช่น "groups")
const MODEL_NAME_TO_KEY = {};
Object.entries(TABLES).forEach(([key, cfg]) => { MODEL_NAME_TO_KEY[cfg.model.name] = key; });

// { belongsTo relations ของ model นี้ } → { ชื่อคอลัมน์ FK: model ปลายทางที่ชี้ไป }
// hasMany ไม่เอามาคิดเพราะเป็นด้านกลับของ belongsTo เดิม (กันข้อมูลซ้ำ)
function getBelongsToMap(model) {
  const map = {};
  Object.values(model.associations || {}).forEach((assoc) => {
    if (assoc.associationType === 'BelongsTo') map[assoc.foreignKey] = assoc.target.name;
  });
  return map;
}

router.get('/tables', (req, res) => {
  const list = Object.entries(TABLES).map(([key, cfg]) => ({ key, label: cfg.label }));
  res.json(list);
});

// ภาพรวมทุกตารางพร้อมความสัมพันธ์ระหว่างกัน — ใช้วาดไดอะแกรม ER แบบ MS Access ในหน้าแรก
router.get('/diagram', (req, res) => {
  const tables = Object.entries(TABLES).map(([key, cfg]) => {
    const fkMap = getBelongsToMap(cfg.model);
    return {
      key,
      label: cfg.label,
      columns: Object.keys(cfg.model.rawAttributes).map((name) => ({
        name,
        primaryKey: !!cfg.model.rawAttributes[name].primaryKey,
        isForeignKey: !!fkMap[name],
        sensitive: cfg.exclude.includes(name),
      })),
    };
  });

  const edges = [];
  Object.entries(TABLES).forEach(([key, cfg]) => {
    Object.values(cfg.model.associations || {}).forEach((assoc) => {
      if (assoc.associationType !== 'BelongsTo') return;
      const targetKey = MODEL_NAME_TO_KEY[assoc.target.name];
      if (!targetKey) return;
      edges.push({ from: key, to: targetKey, field: assoc.foreignKey });
    });
  });

  res.json({ tables, edges });
});

// field + primary key + foreign key + ความสัมพันธ์ (belongsTo/hasMany ฯลฯ) — โครงสร้างเฉยๆ ไม่มีข้อมูลจริง
// FK เดาจาก association "BelongsTo" ของ model นี้เอง (คอลัมน์ที่เป็น foreignKey ของ belongsTo แปลว่า
// คอลัมน์นั้นชี้ไปตารางอื่น) — relations โชว์ทั้ง belongsTo/hasMany/hasOne/belongsToMany ให้ครบ
router.get('/:key/schema', (req, res) => {
  const cfg = TABLES[req.params.key];
  if (!cfg) return res.status(404).json({ error: 'ไม่พบตารางนี้' });

  const model = cfg.model;
  const relations = Object.values(model.associations || {}).map((assoc) => ({
    type: assoc.associationType,
    target: assoc.target.name,
    foreignKey: assoc.foreignKey,
    as: assoc.as,
  }));

  const fkTargetByColumn = getBelongsToMap(model);

  const columns = Object.entries(model.rawAttributes).map(([name, def]) => ({
    name,
    type: def.type?.key || String(def.type),
    primaryKey: !!def.primaryKey,
    allowNull: def.allowNull !== false,
    autoIncrement: !!def.autoIncrement,
    isForeignKey: !!fkTargetByColumn[name],
    references: fkTargetByColumn[name] || null,
    sensitive: cfg.exclude.includes(name),
  }));

  res.json({ columns, relations });
});

router.get('/:key', async (req, res) => {
  const cfg = TABLES[req.params.key];
  if (!cfg) return res.status(404).json({ error: 'ไม่พบตารางนี้' });

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  try {
    const { count, rows } = await cfg.model.findAndCountAll({
      attributes: { exclude: cfg.exclude },
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      order: [[cfg.model.primaryKeyAttribute, 'DESC']],
      raw: true,
    });
    const columns = rows.length > 0
      ? Object.keys(rows[0])
      : Object.keys(cfg.model.rawAttributes).filter((k) => !cfg.exclude.includes(k));
    res.json({ columns, rows, total: count, page, pageSize: PAGE_SIZE });
  } catch (error) {
    console.error(`[ERROR] GET /api/data-browser/${req.params.key}:`, error.message);
    res.status(500).json({ error: 'โหลดข้อมูลไม่สำเร็จ: ' + error.message });
  }
});

module.exports = router;
