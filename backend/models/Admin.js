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
      console.log('🔒 Hashing password for new user:', admin.username);
      admin.password = await bcrypt.hash(admin.password, 10);
      console.log('✅ Password hashed:', admin.password.substring(0, 30) + '...');
    } else {
      console.log('⚠️ Password already hashed, skipping');
    }
  }
});

Admin.beforeUpdate(async (admin) => {
  if (admin.changed('password')) {
    const isHashed = admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$');
    
    if (!isHashed) {
      console.log('🔒 Hashing password for update:', admin.username);
      admin.password = await bcrypt.hash(admin.password, 10);
      console.log('✅ Password hashed:', admin.password.substring(0, 30) + '...');
    } else {
      console.log('⚠️ Password already hashed, skipping');
    }
  }
});

// ✅ Instance method สำหรับตรวจสอบ password
Admin.prototype.validatePassword = async function(password) {
  try {
    console.log('🔐 Validating password for:', this.username);
    console.log('   Input password:', password);
    console.log('   Stored hash:', this.password.substring(0, 30) + '...');
    console.log('   Hash valid format:', this.password.startsWith('$2a$') || this.password.startsWith('$2b$'));
    
    const isMatch = await bcrypt.compare(password, this.password);
    
    console.log('   Compare result:', isMatch ? '✅ MATCH' : '❌ NO MATCH');
    return isMatch;
  } catch (error) {
    console.error('❌ Password validation error:', error);
    return false;
  }
};

module.exports = Admin;