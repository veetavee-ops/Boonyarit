// ============================================================================
// passwordAuth module — ระบบ "เปลี่ยนรหัสผ่าน" + "ลืมรหัสผ่าน (ส่งลิงก์ทาง email)"
//
// โฟลเดอร์นี้ทั้งโฟลเดอร์ถูกออกแบบให้ "copy ไปวางในโปรเจกต์อื่น" ได้เลย
// โดยไม่ต้องแก้โค้ดข้างในไฟล์นี้ — แค่ตอนเรียกใช้ (ในไฟล์ app.js ของแต่ละโปรเจกต์)
// ให้ส่งค่า config เข้ามาให้ตรงกับโปรเจกต์นั้นๆ (ดูตัวอย่างการเรียกใช้ท้ายไฟล์นี้)
// ============================================================================

const express = require('express');
const crypto = require('crypto'); // library มาตรฐานของ Node.js ใช้สุ่มเลข/เข้ารหัส
const bcrypt = require('bcryptjs'); // library เข้ารหัสรหัสผ่าน (hash) แบบเดียวกับที่ Admin.js ใช้อยู่แล้ว
const jwt = require('jsonwebtoken'); // library ตรวจสอบ token การล็อกอิน (JWT)
const rateLimit = require('express-rate-limit'); // library จำกัดจำนวนครั้งที่ยิง request ได้ ป้องกันการ spam

const { createMailer } = require('./mailer');
const definePasswordResetTokenModel = require('./passwordResetToken.model');

// ฟังก์ชันหลักของ module นี้ — เรียกครั้งเดียวตอน setup แอป จะได้ Express router กลับมา
// แล้วเอา router นั้นไปแปะเข้ากับแอปหลักด้วย app.use('/api/auth', router)
function createPasswordAuthRouter(options) {
  const {
    sequelize,        // ตัวเชื่อมต่อฐานข้อมูล (สำหรับสร้างตาราง password_reset_tokens)
    UserModel,        // Sequelize model ของผู้ใช้ในโปรเจกต์นั้น (เช่น Admin)
    jwtSecret,        // secret key เดียวกับที่ใช้ตอน login (ถอดรหัส JWT token)
    smtp,             // ค่าตั้งค่า SMTP { host, port, secure, user, pass, from }
    appBaseUrl,       // URL ของหน้าเว็บ (เช่น http://localhost:5173) ใช้สร้างลิงก์ในอีเมล
    fields = {},      // ชื่อคอลัมน์ในตาราง user ของแต่ละโปรเจกต์ (เผื่อชื่อไม่เหมือนกัน)
    tokenExpiryMinutes = 30, // ลิงก์ reset จะหมดอายุกี่นาที (ค่า default 30 นาที)
  } = options;

  // ชื่อฟิลด์ในตาราง user — ถ้าโปรเจกต์อื่นตั้งชื่อคอลัมน์ต่างออกไป แค่ส่ง fields เข้ามาตอนเรียกใช้
  const emailField = fields.email || 'email';
  const passwordField = fields.password || 'password';

  // สร้างตาราง password_reset_tokens (ถ้ายังไม่มี sequelize.sync() ตอน server เริ่มจะสร้างให้เอง)
  const PasswordResetToken = definePasswordResetTokenModel(sequelize);

  // สร้างตัวส่งอีเมล จาก config ที่ส่งเข้ามา
  const mailer = createMailer(smtp);

  const router = express.Router();

  // จำกัดไม่ให้ยิง "ขอลิงก์ลืมรหัสผ่าน" ถี่เกินไป (กันคนร้าย spam อีเมลคนอื่น)
  // อนุญาต 5 ครั้ง ต่อ 15 นาที ต่อ 1 IP
  const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'ขอลิงก์รีเซ็ตรหัสผ่านบ่อยเกินไป กรุณาลองใหม่ภายหลัง' },
  });

  // ฟังก์ชันช่วยดึง JWT token ออกมาจาก request (มาจาก cookie หรือ Authorization header ก็ได้)
  // เขียนแบบเดียวกับที่ backend/routes/auth.js เดิมใช้ เพื่อให้ /change-password ทำงานร่วมกับระบบ login เดิมได้
  function getTokenFromRequest(req) {
    return req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  }

  // --------------------------------------------------------------------------
  // POST /change-password
  // ใช้ตอน "ล็อกอินอยู่แล้ว" และอยากเปลี่ยนรหัสผ่านเอง (ต้องรู้รหัสผ่านเดิมก่อน)
  // body ที่ต้องส่งมา: { currentPassword, newPassword }
  // --------------------------------------------------------------------------
  router.post('/change-password', async (req, res) => {
    try {
      // 1) เช็คว่า login อยู่จริงไหม โดยถอดรหัส JWT token
      const token = getTokenFromRequest(req);
      if (!token) {
        return res.status(401).json({ error: 'กรุณาล็อกอินก่อน' });
      }

      const decoded = jwt.verify(token, jwtSecret); // ถ้า token ผิด/หมดอายุ จะ throw error ทันที
      const user = await UserModel.findByPk(decoded.id);
      if (!user) {
        return res.status(401).json({ error: 'ไม่พบผู้ใช้งาน' });
      }

      // 2) เช็คว่าส่งข้อมูลมาครบไหม
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'ต้องระบุรหัสผ่านเดิมและรหัสผ่านใหม่' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' });
      }

      // 3) เช็ครหัสผ่านเดิมว่าถูกต้องไหม (เทียบกับค่า hash ที่เก็บไว้ใน database)
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user[passwordField]);
      if (!isCurrentPasswordValid) {
        return res.status(401).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
      }

      // 4) เข้ารหัส (hash) รหัสผ่านใหม่ แล้วบันทึกทับของเดิม
      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await user.update({ [passwordField]: newPasswordHash });

      res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // --------------------------------------------------------------------------
  // POST /forgot-password
  // ใช้ตอน "ลืมรหัสผ่าน ล็อกอินไม่ได้" — กรอกอีเมล แล้วระบบจะส่งลิงก์ไปให้
  // body ที่ต้องส่งมา: { email }
  // --------------------------------------------------------------------------
  router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'ต้องระบุอีเมล' });
      }

      // หา user ที่มีอีเมลตรงกับที่กรอกมา
      const user = await UserModel.findOne({ where: { [emailField]: email } });

      // หมายเหตุสำคัญ: ไม่ว่าจะเจอ user หรือไม่เจอ เราจะตอบกลับข้อความเดียวกันเสมอ
      // เพื่อไม่ให้คนร้ายใช้ endpoint นี้เดาว่า "อีเมลนี้มีอยู่ในระบบไหม" (ป้องกัน user enumeration)
      if (user) {
        // สุ่ม token ดิบๆ ยาว 32 byte แปลงเป็นตัวอักษร hex (จะได้ยาว 64 ตัวอักษร)
        const rawToken = crypto.randomBytes(32).toString('hex');

        // เข้ารหัส token ดิบด้วย sha256 ก่อนเก็บลง database (เก็บ token ตรงๆ ไม่ปลอดภัย)
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

        // คำนวณเวลาหมดอายุ = ตอนนี้ + tokenExpiryMinutes นาที
        const expiresAt = new Date(Date.now() + tokenExpiryMinutes * 60 * 1000);

        // บันทึก token ลงตาราง password_reset_tokens
        await PasswordResetToken.create({ userId: user.id, tokenHash, expiresAt });

        // สร้างลิงก์เต็มๆ ที่จะใส่ในอีเมล เช่น http://localhost:5173/reset-password?token=xxxx
        const resetUrl = `${appBaseUrl}/reset-password?token=${rawToken}`;

        // ส่งอีเมล (ส่ง token ดิบไปในลิงก์ ไม่ใช่ตัวที่ hash แล้ว — เพราะเราต้อง hash ตอนตรวจสอบทีหลัง)
        await mailer.sendResetEmail(email, resetUrl);
      }

      res.json({
        success: true,
        message: 'ถ้าอีเมลนี้มีอยู่ในระบบ เราได้ส่งลิงก์รีเซ็ตรหัสผ่านไปให้แล้ว กรุณาตรวจสอบอีเมลของคุณ',
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // --------------------------------------------------------------------------
  // POST /reset-password/:token
  // หน้าที่ผู้ใช้มาถึงหลังจากกดลิงก์ในอีเมล — กรอกรหัสผ่านใหม่แล้วส่งมาพร้อม token
  // body ที่ต้องส่งมา: { newPassword }
  // --------------------------------------------------------------------------
  router.post('/reset-password/:token', async (req, res) => {
    try {
      const { token: rawToken } = req.params;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' });
      }

      // hash token ที่ได้รับมา (ด้วยวิธีเดียวกับตอนสร้าง) แล้วเอาไปค้นหาใน database
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const resetToken = await PasswordResetToken.findOne({ where: { tokenHash } });

      // ตรวจสอบว่า token นี้ใช้ได้จริงไหม: ต้องมีอยู่จริง, ยังไม่เคยถูกใช้, และยังไม่หมดอายุ
      const isExpired = !resetToken || resetToken.expiresAt < new Date();
      const isAlreadyUsed = resetToken && resetToken.usedAt;
      if (!resetToken || isExpired || isAlreadyUsed) {
        return res.status(400).json({ error: 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอลิงก์ใหม่' });
      }

      // หา user เจ้าของ token นี้
      const user = await UserModel.findByPk(resetToken.userId);
      if (!user) {
        return res.status(400).json({ error: 'ไม่พบผู้ใช้งาน' });
      }

      // เข้ารหัสรหัสผ่านใหม่แล้วบันทึกทับของเดิม
      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await user.update({ [passwordField]: newPasswordHash });

      // ทำเครื่องหมายว่า token นี้ถูกใช้ไปแล้ว กันเอากลับมาใช้ซ้ำ
      await resetToken.update({ usedAt: new Date() });

      res.json({ success: true, message: 'ตั้งรหัสผ่านใหม่สำเร็จ กรุณาล็อกอินด้วยรหัสผ่านใหม่' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = { createPasswordAuthRouter };

// ============================================================================
// วิธีเอา module นี้ไปใช้ในโปรเจกต์อื่น:
//
//   const { createPasswordAuthRouter } = require('./modules/passwordAuth');
//   const sequelize = require('./config/database');
//   const { User } = require('./models'); // model ผู้ใช้ของโปรเจกต์นั้น (ต้องมี password ที่ hash ด้วย bcrypt)
//
//   const passwordAuthRouter = createPasswordAuthRouter({
//     sequelize,
//     UserModel: User,
//     jwtSecret: process.env.JWT_SECRET,
//     appBaseUrl: process.env.FRONTEND_URL,
//     smtp: {
//       host: process.env.SMTP_HOST,
//       port: Number(process.env.SMTP_PORT) || 587,
//       secure: process.env.SMTP_SECURE === 'true',
//       user: process.env.SMTP_USER,
//       pass: process.env.SMTP_PASS,
//       from: process.env.SMTP_FROM,
//     },
//     fields: { email: 'email', password: 'password' }, // ปรับชื่อคอลัมน์ตามตาราง user จริงของโปรเจกต์นั้น
//   });
//
//   app.use('/api/auth', passwordAuthRouter);
//
// จะได้ endpoint: POST /api/auth/change-password, /api/auth/forgot-password, /api/auth/reset-password/:token
// ============================================================================
