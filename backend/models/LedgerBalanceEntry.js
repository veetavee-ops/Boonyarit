// ตาราง ledger เช็คยอดคงเหลือสมุดบัญชี (ยืม-คืนเงินเพื่อการลงทุน) — คนละเรื่องกับ PaymentVerification
// (รายงานตั้งเบิก vs สกรีนธนาคาร) เก็บ schema แยก "ledger_balance" เพราะเป็นฟีเจอร์คนละตัว ไม่อยากผูก
// กับชื่อ schema "payment_verification" ที่เจาะจงอีกฟีเจอร์หนึ่งอยู่แล้ว
//
// ระบบเป็นคนคำนวณ+จำ "ยอดคงเหลือ" เองต่อเนื่องทุกรายการ (ไม่อ่านจากรูปสมุดใหม่ทุกครั้ง) — ยอดปัจจุบัน
// ของแต่ละกลุ่ม/บริษัท = calculatedBalance ของแถวล่าสุด (เรียงตาม submittedAt เวลาระบบรับจริง ไม่ใช่
// occurredAt ที่อ่านจากรูป กันวันที่อ่านผิดทำให้ลำดับ chain เพี้ยน)
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LedgerBalanceEntry = sequelize.define('LedgerBalanceEntry', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    groupId: { type: DataTypes.STRING, allowNull: false },
    submittedBy: { type: DataTypes.STRING, allowNull: false }, // LINE userId
    submittedAt: { type: DataTypes.DATE, allowNull: false },   // ใช้เรียงลำดับ chain เสมอ

    entryType: { type: DataTypes.STRING, allowNull: false }, // 'seed' (ตั้งยอดเริ่มต้นจากรูปสมุด) | 'transaction' (สลิปโอนเงิน)
    direction: { type: DataTypes.STRING, allowNull: true },  // 'in' (ยืมเงิน) | 'out' (คืนเงิน) — null สำหรับ seed
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: true }, // null สำหรับ seed

    occurredAt: DataTypes.DATE,             // วันที่อ่านได้จากสลิป — ใช้โชว์/ตรวจสอบเท่านั้น ห้ามใช้เรียง chain
    counterName: DataTypes.TEXT,            // ชื่อผู้โอน/รับที่อ่านได้จากสลิป (เก็บไว้ตรวจสอบย้อนหลัง)
    referenceNameMatched: DataTypes.STRING, // 'from' | 'to' — ฝั่งไหนของสลิปที่ตรงกับ ledgerReferenceName ของกลุ่ม (audit การตัดสินทิศทาง)

    slipImagePaths: { type: DataTypes.JSONB, defaultValue: [] }, // gcsPath รูปสลิป 1-2 รูป (ว่างสำหรับ seed)
    extractedRaw: { type: DataTypes.JSONB, defaultValue: {} },   // ผลอ่านดิบจาก AI ทั้งก้อน เก็บไว้ตรวจสอบย้อนหลัง
    model: DataTypes.STRING, // โมเดล/provider ที่อ่านสำเร็จ

    previousBalance: { type: DataTypes.DECIMAL(14, 2), allowNull: true }, // null เฉพาะแถว seed แถวแรกสุด
    calculatedBalance: { type: DataTypes.DECIMAL(14, 2), allowNull: false }, // ยอดคงเหลือหลังรายการนี้ — ค่านี้คือ "ยอดปัจจุบัน" ของบริษัท

    // ตรวจทานเทียบกับรูปสมุดบัญชีที่เขียนจริงภายหลัง (คำสั่ง "เช็คสมุด") — optional, ใช้กับ entryType='transaction' เท่านั้น
    writtenBalanceImagePath: DataTypes.TEXT,
    writtenBalanceExtracted: DataTypes.DECIMAL(14, 2),
    writtenBalanceCheckedAt: DataTypes.DATE,
    writtenBalanceCheckedBy: DataTypes.STRING,
    matchesWrittenBalance: DataTypes.BOOLEAN, // null = ยังไม่ได้เช็ค

    status: { type: DataTypes.STRING, defaultValue: 'pending_check' }, // pending_check | confirmed | mismatch | corrected

    correctedBy: { type: DataTypes.UUID, allowNull: true }, // adminId ที่แก้ไขด้วยมือ
    correctedAt: { type: DataTypes.DATE, allowNull: true },
    correctionNote: { type: DataTypes.TEXT, allowNull: true },
}, {
    schema: 'ledger_balance',
    tableName: 'ledger_balance_entries',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = LedgerBalanceEntry;
