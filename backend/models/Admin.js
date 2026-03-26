const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const Admin = sequelize.define('Admin', {
  id: { 
    type: DataTypes.UUID, 
    defaultValue: DataTypes.UUIDV4, 
    primaryKey: true 
  },
  username: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  }
}, {
  tableName: 'admins',
  timestamps: true
});

// ✅ ใช้ class method แทน instance hooks
Admin.beforeCreate(async (admin) => {
  if (admin.password) {
    // เช็คว่า hash แล้วหรือยัง
    const isHashed = admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$');
    
    if (!isHashed) {
      admin.password = await bcrypt.hash(admin.password, 10);
    }
  }
});

Admin.beforeUpdate(async (admin) => {
  if (admin.changed('password')) {
    const isHashed = admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$');
    
    if (!isHashed) {
      admin.password = await bcrypt.hash(admin.password, 10);
    }
  }
});

// ✅ Instance method สำหรับตรวจสอบ password
Admin.prototype.validatePassword = async function(password) {
  try {
    return await bcrypt.compare(password, this.password);
  } catch (error) {
    console.error('[Auth] Password validation error:', error.message);
    return false;
  }
};

module.exports = Admin;