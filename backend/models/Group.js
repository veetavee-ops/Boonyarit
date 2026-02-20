const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Group = sequelize.define('Group', {
    groupId: { type: DataTypes.STRING, primaryKey: true },
    groupName: DataTypes.STRING,
    pictureUrl: DataTypes.TEXT,
}, { timestamps: true });

module.exports = Group;