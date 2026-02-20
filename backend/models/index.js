const User = require('./User');
const Group = require('./Group');
const Message = require('./Message');
const MessageAttachment = require('./MessageAttachment');
const Admin = require('./Admin'); // ✅ ต้องมี

// Associations
Message.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Message.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
User.hasMany(Message, { foreignKey: 'userId' });
Group.hasMany(Message, { foreignKey: 'groupId' });
Message.hasOne(MessageAttachment, { foreignKey: 'messageId', as: 'attachment' });
Message.hasMany(MessageAttachment, { foreignKey: 'messageId', as: 'attachments' });
MessageAttachment.belongsTo(Message, { foreignKey: 'messageId' });

module.exports = {
  User,
  Group,
  Message,
  MessageAttachment,
  Admin // ✅ ต้องมี
};