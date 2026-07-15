// รายการ ledger รายรับ-รายจ่าย แตกจาก bankItems ของแต่ละ PaymentVerification ออกมาเป็นแถวเดี่ยว
// เก็บใน schema เดียวกับ PaymentVerification (payment_verification) — groupId ทำหน้าที่เป็นตัวระบุ
// "บัญชี" (1 กลุ่ม LINE ที่ติดธง isPaymentVerifyGroup = 1 บัญชีธนาคาร)
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AccountLedgerEntry = sequelize.define('AccountLedgerEntry', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    groupId: { type: DataTypes.STRING, allowNull: false },
    paymentVerificationId: { type: DataTypes.UUID, allowNull: false },

    direction: { type: DataTypes.STRING, allowNull: false }, // 'in' | 'out'
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    counterName: DataTypes.TEXT,
    counterAccount: DataTypes.STRING,

    occurredAt: { type: DataTypes.DATE, allowNull: false }, // submittedAt ของ submission + "time" ที่ OCR อ่านได้ (fallback = submittedAt)
    runningBalance: DataTypes.DECIMAL(14, 2), // คำนวณย้อนจาก endingBalance ของ submission นั้น
    sortOrder: { type: DataTypes.INTEGER, allowNull: false }, // ตำแหน่งเดิมใน bankItems array
}, {
    schema: 'payment_verification',
    tableName: 'account_ledger_entries',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = AccountLedgerEntry;
