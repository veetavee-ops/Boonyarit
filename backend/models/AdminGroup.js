const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AdminGroup = sequelize.define('AdminGroup', {
  adminId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'admins', key: 'id' },
  },
  // groupId เป็น "permission key" แบบยืดหยุ่น ไม่ใช่แค่รหัสกลุ่ม LINE จริงเท่านั้น —
  // DM ใช้ค่า pseudo-id "private_<lineUserId>" ซึ่งไม่มีแถวจริงในตาราง Groups
  // เลยห้ามผูก foreign key ไว้ (เคยผูกไว้ก่อนหน้านี้ ทำให้ auto-grant สิทธิ์ DM ล้มเหลวเงียบๆ มาตลอด)
  groupId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  timestamps: false,
  indexes: [{ unique: true, fields: ['adminId', 'groupId'] }],
});

module.exports = AdminGroup;
