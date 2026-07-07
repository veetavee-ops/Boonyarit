// ไฟล์นี้สร้าง "ตาราง" ในฐานข้อมูลไว้เก็บ token (รหัสลับชั่วคราว) ที่ใช้ตอนลืมรหัสผ่าน
// เวลา user กด "ลืมรหัสผ่าน" ระบบจะสุ่ม token ขึ้นมา 1 ตัว เก็บลงตารางนี้ แล้วส่ง link ที่มี token นั้นไปทาง email
// ตารางนี้แยกออกมาต่างหาก ไม่ไปรวมกับตาราง user เพื่อให้ copy module นี้ไปใช้โปรเจกต์อื่นได้ง่าย
// (โปรเจกต์อื่นจะมีตาราง user หน้าตาแบบไหนก็ได้ ไม่ต้องแก้ตาราง user เลย)
const { DataTypes } = require('sequelize');

// ฟังก์ชันนี้รับ sequelize (ตัวเชื่อมต่อฐานข้อมูล) เข้ามา แล้ว "define" (นิยาม) ตารางให้
// เหตุผลที่ทำเป็นฟังก์ชันแทนที่จะ export ตัวแปรตรงๆ คือ โปรเจกต์แต่ละที่อาจมี sequelize instance คนละตัว
function definePasswordResetTokenModel(sequelize) {
  // sequelize.define(ชื่อ model, { ฟิลด์ต่างๆ }, { ตั้งค่าเพิ่มเติม })
  const PasswordResetToken = sequelize.define('PasswordResetToken', {
    // id หลักของแถว ใช้ UUID (รหัสสุ่มยาวๆ) แทนเลขรันนิ่ง เพื่อเดาไม่ได้
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4, // ให้ database สุ่มค่าเองอัตโนมัติตอนสร้างแถวใหม่
      primaryKey: true,
    },
    // เก็บ id ของ user เจ้าของ token นี้ (ไม่ผูก foreign key ตายตัวกับตาราง user
    // เพราะแต่ละโปรเจกต์ตาราง user อาจชื่อไม่เหมือนกัน — ผูกด้วย logic ในโค้ดแทน)
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    // เราไม่เก็บ token ตัวจริงลง database ตรงๆ (เผื่อ database รั่วไหล คนร้ายจะเอา token ไปใช้ต่อไม่ได้)
    // แต่เก็บ "hash" (ค่าที่เข้ารหัสทางเดียว แปลงกลับไม่ได้) ของ token แทน
    tokenHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    // เวลาหมดอายุของ token — ถ้าเลยเวลานี้แล้ว จะ reset รหัสผ่านไม่ได้อีก ต้องขอ link ใหม่
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    // ถ้า token ถูกใช้ไปแล้ว (reset รหัสผ่านสำเร็จแล้ว) จะบันทึกเวลาไว้ตรงนี้
    // มีค่า = ใช้ไปแล้ว (ใช้ซ้ำไม่ได้), เป็น null = ยังไม่เคยใช้
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'password_reset_tokens', // ชื่อตารางจริงใน database
    timestamps: true, // ให้ sequelize เพิ่มคอลัมน์ createdAt/updatedAt ให้อัตโนมัติ
  });

  return PasswordResetToken;
}

// export ฟังก์ชันออกไปให้ไฟล์อื่นเรียกใช้ได้
module.exports = definePasswordResetTokenModel;
