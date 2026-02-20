const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
    userId: { type: DataTypes.STRING, primaryKey: true },
    displayName: DataTypes.STRING,
    pictureUrl: DataTypes.TEXT,
}, { timestamps: true });

module.exports = User;