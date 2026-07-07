const User = require('./User');
const Group = require('./Group');
const Message = require('./Message');
const Admin = require('./Admin');
const AdminGroup = require('./AdminGroup');
const Label = require('./Label');
const GroupLabel = require('./GroupLabel');
const Setting = require('./Setting');

// ความสัมพันธ์ระหว่าง Message, User, Group
Message.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Message.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
User.hasMany(Message, { foreignKey: 'userId' });
Group.hasMany(Message, { foreignKey: 'groupId' });

// ความสัมพันธ์ระหว่าง Admin ↔ AdminGroup
Admin.hasMany(AdminGroup, { foreignKey: 'adminId', as: 'groupAccess' });
AdminGroup.belongsTo(Admin, { foreignKey: 'adminId' });

// ความสัมพันธ์ระหว่าง Label ↔ Group (many-to-many ผ่าน GroupLabel)
Label.hasMany(GroupLabel, { foreignKey: 'labelId', as: 'assignments' });
GroupLabel.belongsTo(Label, { foreignKey: 'labelId' });

// Label เป็นของ admin คนเดียว (ไม่แชร์ร่วมกันข้าม user)
Admin.hasMany(Label, { foreignKey: 'adminId', as: 'labels' });
Label.belongsTo(Admin, { foreignKey: 'adminId' });

module.exports = {
  User,
  Group,
  Message,
  Admin,
  AdminGroup,
  Label,
  GroupLabel,
  Setting,
};