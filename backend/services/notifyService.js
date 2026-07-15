const { client } = require('./lineService');
const nodemailer = require('nodemailer');

const ADMIN_USER_ID = process.env.ADMIN_LINE_USER_ID;
const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL;

// สร้าง transporter แค่ตอนมี SMTP creds ครบ — production server ที่ยังไม่ได้อัปเดต .env จะได้ไม่พังตอน
// require ไฟล์นี้ (notifyAdminEmail จะแค่ no-op เงียบๆ ถ้าไม่มี transporter แทน)
const mailTransporter = (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
    : null;

async function notifyAdmin(message) {
    if (!ADMIN_USER_ID) return;
    try {
        await client.pushMessage(ADMIN_USER_ID, {
            type: 'text',
            text: message,
        });
    } catch (e) {
        console.error('[NOTIFY] Failed to send admin notification:', e.message);
    }
}

// ช่องแจ้งเตือนสำรองทางอีเมล — ใช้เฉพาะจุดที่ต้องการ redundancy จริงๆ (เช่น health check) ไม่ใช่ตัวหลัก
// ไม่ผูกเข้ากับ alertError() ทั่วไปเพื่อกันสแปมกล่องเมลจาก error ทั่วไปที่เกิดบ่อย/ไม่ร้ายแรง
async function notifyAdminEmail(subject, message) {
    if (!mailTransporter || !ADMIN_ALERT_EMAIL) return;
    try {
        await mailTransporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: ADMIN_ALERT_EMAIL,
            subject: `[Boonyarit] ${subject}`,
            text: message,
        });
    } catch (e) {
        console.error('[NOTIFY] Failed to send admin alert email:', e.message);
    }
}

function alertError(service, error) {
    const msg = `⚠️ [${service}] มีปัญหา\n${error}`;
    console.error(msg);
    notifyAdmin(msg);
}

module.exports = { notifyAdmin, notifyAdminEmail, alertError };
