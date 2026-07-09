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
}, { timestamps: true });

module.exports = Group;