const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MessageAttachment = sequelize.define('MessageAttachment', {
    id: { 
        type: DataTypes.UUID, 
        defaultValue: DataTypes.UUIDV4, 
        primaryKey: true 
    },
    messageId: { 
        type: DataTypes.UUID, 
        allowNull: false
        // ✅ ลบ unique: true เพื่อให้ 1 message มีได้หลาย attachment
    },
    sequenceNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'ลำดับของรูปภาพในชุด (0, 1, 2, ...)'
    },
    fileData: {
        type: DataTypes.BLOB('long'), // เก็บ Binary รูปภาพ
        allowNull: false
    },
    fileName: DataTypes.STRING,
    fileType: DataTypes.STRING // เช่น 'image/jpeg'
}, { 
    tableName: 'message_attachments',
    timestamps: true  // ✅ เพิ่ม createdAt, updatedAt
});

module.exports = MessageAttachment;