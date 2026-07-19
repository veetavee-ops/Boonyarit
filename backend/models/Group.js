const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Group = sequelize.define('Group', {
    groupId: { type: DataTypes.STRING, primaryKey: true },
    groupName: DataTypes.STRING,
    pictureUrl: DataTypes.TEXT,
    // เปิดใช้งานฟีเจอร์ตรวจสอบการโอน-จ่ายเงิน (OCR) เฉพาะกลุ่มที่ติดธงนี้เท่านั้น
    isPaymentVerifyGroup: { type: DataTypes.BOOLEAN, defaultValue: false },
    // เปิดใช้งานฟีเจอร์สรุปบิลซื้อของ (OCR) เฉพาะกลุ่มที่ติดธงนี้เท่านั้น
    isReceiptSummaryGroup: { type: DataTypes.BOOLEAN, defaultValue: false },
    // เปิดใช้งานฟีเจอร์เช็คยอดสมุดบัญชี (ยืม-คืนเงิน) เฉพาะกลุ่มที่ติดธงนี้เท่านั้น
    isLedgerBalanceGroup: { type: DataTypes.BOOLEAN, defaultValue: false },
    // ชื่ออ้างอิง (เช่น "พรพล") ใช้เทียบฝั่ง "จาก"/"ถึง" บนสลิปโอนเงิน เพื่อตัดสินทิศทาง ยืม/คืน
    // ต้องตั้งค่านี้ก่อนใช้ฟีเจอร์เช็คยอดสมุดบัญชีได้ (ต่างกลุ่มอาจมีชื่ออ้างอิงคนละคน)
    ledgerReferenceName: { type: DataTypes.STRING, allowNull: true },
}, { timestamps: true });

module.exports = Group;