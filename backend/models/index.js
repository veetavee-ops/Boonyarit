const User = require('./User');
const Group = require('./Group');
const Message = require('./Message');
const Admin = require('./Admin');
const AdminGroup = require('./AdminGroup');
const Label = require('./Label');
const GroupLabel = require('./GroupLabel');
const Setting = require('./Setting');
const PaymentVerification = require('./PaymentVerification');

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

// PaymentVerification ผูกกับ Group เพื่อ join ดึงชื่อกลุ่มมาแสดงใน dashboard ได้
// constraints: false — ปิด auto FK constraint เพราะ Group อยู่คนละ schema (public) กับ PaymentVerification
// (payment_verification) แล้ว Sequelize sync() qualify schema ของฝั่งอ้างอิงผิด ทำให้สร้างตารางไม่ผ่าน
// ยัง join ตอน query ได้ปกติ แค่ไม่มี FK constraint ระดับ DB เท่านั้น
PaymentVerification.belongsTo(Group, { foreignKey: 'groupId', targetKey: 'groupId', as: 'group', constraints: false });

module.exports = {
  User,
  Group,
  Message,
  Admin,
  AdminGroup,
  Label,
  GroupLabel,
  Setting,
  PaymentVerification,
};