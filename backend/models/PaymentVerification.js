// ตาราง ledger ผลตรวจสอบการโอน-จ่ายเงิน (เทียบรายงานตั้งเบิก vs สลิปธนาคารจริงด้วย AI vision)
// เก็บใน schema แยก "payment_verification" ไม่ปนกับตาราง messages ทั่วไปใน schema public
// เพราะมีหลายบัญชี/หลายบริษัท และเป็นข้อมูลการเงินภายในที่จำกัดสิทธิ์ดูเฉพาะ role admin เท่านั้น
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PaymentVerification = sequelize.define('PaymentVerification', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    groupId: { type: DataTypes.STRING, allowNull: false },
    submittedBy: { type: DataTypes.STRING, allowNull: false }, // LINE userId ของเจ้าหน้าที่ที่ส่งรูป
    submittedAt: { type: DataTypes.DATE, allowNull: false },

    reportImagePath: DataTypes.TEXT, // gcsPath รูปรายงานตั้งเบิก
    bankImagePath: DataTypes.TEXT,   // gcsPath รูปสกรีนธนาคาร

    reportItems: { type: DataTypes.JSONB, defaultValue: [] }, // ผลอ่านจากรูปตั้งเบิก
    bankItems: { type: DataTypes.JSONB, defaultValue: [] },   // ผลอ่านจากรูปธนาคาร
    matchResults: { type: DataTypes.JSONB, defaultValue: [] }, // ผลจับคู่แต่ละรายการ

    overallStatus: { type: DataTypes.STRING, defaultValue: 'has_mismatch' }, // matched | has_mismatch | corrected
    endingBalance: DataTypes.DECIMAL(14, 2), // ยอดคงเหลือจากรูปธนาคาร เก็บไว้เทียบต่อเนื่อง

    correctedBy: { type: DataTypes.UUID, allowNull: true }, // adminId ที่แก้ไขด้วยมือ
    correctedAt: { type: DataTypes.DATE, allowNull: true },
    correctionNote: { type: DataTypes.TEXT, allowNull: true },
}, {
    schema: 'payment_verification',
    tableName: 'payment_verifications',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = PaymentVerification;
