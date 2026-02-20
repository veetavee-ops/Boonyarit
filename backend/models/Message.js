const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Message = sequelize.define('Message', {
    id: { 
        type: DataTypes.UUID, 
        defaultValue: DataTypes.UUIDV4, 
        primaryKey: true 
    },
    messageId: { 
        type: DataTypes.STRING, 
        unique: true 
    },
    messageType: DataTypes.STRING,
    timestamp: DataTypes.DATE,
    userId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    groupId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    sourceType: {
        type: DataTypes.STRING,
        allowNull: false
    },
    text: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    metadata: {
        type: DataTypes.JSONB, 
        allowNull: true
    }
}, {
    tableName: 'messages',
    timestamps: true
});

module.exports = Message;