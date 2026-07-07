// สร้างตาราง Labels ใน database — เก็บชื่อและสีของแต่ละ label
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Label = sequelize.define('Label', {
  // รหัส label — เพิ่มทีละ 1 อัตโนมัติ
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  // เจ้าของ label — แต่ละ admin เห็น/จัดการ label ของตัวเองเท่านั้น ไม่แชร์ร่วมกันอีกต่อไป
  adminId: { type: DataTypes.UUID, allowNull: false },
  // ชื่อ label เช่น "งานก่อสร้าง", "ทีม A"
  name: { type: DataTypes.STRING, allowNull: false },
  // สี hex เช่น "#3b82f6" — ใช้แสดงสีของ tab
  color: { type: DataTypes.STRING, defaultValue: '#3b82f6' },
}, { timestamps: true });

module.exports = Label;
