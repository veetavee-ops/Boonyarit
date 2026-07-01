// ไฟล์นี้ทำหน้าที่เดียว คือ "ส่ง email" ผ่าน SMTP (เช่น Gmail SMTP)
// เราแยกเรื่องส่งเมลออกมาเป็นไฟล์ของตัวเอง เพื่อให้ routes.js ไม่ต้องรู้รายละเอียดว่าส่งเมลยังไง
const nodemailer = require('nodemailer'); // library สำหรับส่ง email จาก Node.js

// ฟังก์ชันนี้รับค่าตั้งค่า SMTP เข้ามา แล้วคืน object ที่มีฟังก์ชัน sendResetEmail ให้ใช้งาน
// smtpConfig ต้องมี: host, port, secure, user, pass, from
function createMailer(smtpConfig) {
  const { host, port, secure, user, pass, from } = smtpConfig;

  // สร้าง "transporter" คือตัวเชื่อมต่อไปหา SMTP server (เช่น smtp.gmail.com)
  // auth คือ username/password สำหรับ login เข้า SMTP server นั้น
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure, // true = ใช้ SSL (port 465), false = ใช้ STARTTLS (port 587)
    auth: { user, pass },
  });

  // ฟังก์ชันสำหรับส่ง "email ลิงก์รีเซ็ตรหัสผ่าน" โดยเฉพาะ
  // to = อีเมลปลายทางที่จะส่งไปหา, resetUrl = ลิงก์เต็มๆ ที่ผู้ใช้ต้องกดเพื่อไปตั้งรหัสผ่านใหม่
  async function sendResetEmail(to, resetUrl) {
    await transporter.sendMail({
      from: from || user, // ชื่อ/อีเมลผู้ส่งที่ผู้รับจะเห็น
      to, // อีเมลผู้รับ
      subject: 'รีเซ็ตรหัสผ่านของคุณ', // หัวเรื่องอีเมล
      // เนื้อหาอีเมลแบบ HTML — มีปุ่ม/ลิงก์ให้กดไปหน้ารีเซ็ตรหัสผ่าน
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>รีเซ็ตรหัสผ่าน</h2>
          <p>เราได้รับคำขอให้รีเซ็ตรหัสผ่านของบัญชีนี้ กดลิงก์ด้านล่างเพื่อตั้งรหัสผ่านใหม่ (ลิงก์นี้จะหมดอายุใน 30 นาที)</p>
          <p>
            <a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#16a34a;color:#fff;border-radius:6px;text-decoration:none;">
              ตั้งรหัสผ่านใหม่
            </a>
          </p>
          <p style="color:#888;font-size:12px;">ถ้าคุณไม่ได้ขอรีเซ็ตรหัสผ่าน สามารถละเว้นอีเมลนี้ได้เลย รหัสผ่านเดิมจะยังใช้งานได้ปกติ</p>
        </div>
      `,
    });
  }

  // คืนค่า object ที่มีฟังก์ชัน sendResetEmail ให้ไฟล์อื่นเรียกใช้
  return { sendResetEmail };
}

module.exports = { createMailer };
