// ตรวจสุขภาพ GCS + Google Drive แบบ synthetic check เป็นรอบๆ (อัปโหลดไฟล์เล็กๆ จริงแล้วลบทิ้ง)
// แทนที่จะรอให้ user จริงเจอปัญหาก่อนแล้วค่อยรู้ (เคยเกิดมาแล้วหลายรอบ — GCS/Drive พังเงียบๆ โดยที่ user
// เข้าใจว่าบันทึกปกติ กว่าจะรู้ก็สาย) — alert แบบ edge-triggered เท่านั้น (แจ้งตอนเปลี่ยนสถานะ พัง→ปกติ
// หรือ ปกติ→พัง) ไม่แจ้งซ้ำทุกรอบตอนยังพังต่อเนื่อง กันสแปม LINE แอดมิน
const { uploadToGCS, deleteFromGCS } = require('./gcsService');
const { checkDriveAuth } = require('./driveService');
const { alertError, notifyAdmin, notifyAdminEmail } = require('./notifyService');
const { Setting } = require('../models/index');

const GCS_HEALTH_PATH = '_health-check/ping.txt';
const CHECK_INTERVAL_MS = 20 * 60 * 1000; // 20 นาที
const FIRST_CHECK_DELAY_MS = 60 * 1000; // รอ 1 นาทีหลัง server start ก่อนเช็ครอบแรก

let gcsHealthy = true;
let driveHealthy = true;

async function isDriveEnabled() {
    const s = await Setting.findByPk('drive_enabled');
    return s ? s.value === 'true' : true; // default เปิดอยู่ (เหมือน webhook.js)
}

async function checkGCS() {
    try {
        await uploadToGCS(Buffer.from(`health-check ${new Date().toISOString()}`), GCS_HEALTH_PATH, '.txt');
        await deleteFromGCS(GCS_HEALTH_PATH);
        if (!gcsHealthy) {
            gcsHealthy = true;
            notifyAdmin('✅ GCS กลับมาทำงานปกติแล้ว');
            notifyAdminEmail('GCS กลับมาทำงานปกติแล้ว', '✅ GCS กลับมาทำงานปกติแล้ว');
        }
    } catch (e) {
        if (gcsHealthy) {
            gcsHealthy = false;
            const msg = `อัปโหลด/ลบไฟล์ทดสอบไม่สำเร็จ: ${e.message}`;
            alertError('GCS Health Check', msg);
            notifyAdminEmail('GCS มีปัญหา', `⚠️ GCS Health Check ล้มเหลว\n${msg}`);
        } else {
            console.error('[HealthCheck] GCS ยังพังต่อเนื่อง:', e.message);
        }
    }
}

async function checkDrive() {
    try {
        if (!(await isDriveEnabled())) return; // แอดมินปิด Drive ไว้เอง ไม่ต้องเช็ค
        await checkDriveAuth();
        if (!driveHealthy) {
            driveHealthy = true;
            notifyAdmin('✅ Google Drive กลับมาทำงานปกติแล้ว');
            notifyAdminEmail('Google Drive กลับมาทำงานปกติแล้ว', '✅ Google Drive กลับมาทำงานปกติแล้ว');
        }
    } catch (e) {
        if (driveHealthy) {
            driveHealthy = false;
            alertError('Drive Health Check', e.message);
            notifyAdminEmail('Google Drive มีปัญหา', `⚠️ Drive Health Check ล้มเหลว\n${e.message}`);
        } else {
            console.error('[HealthCheck] Drive ยังพังต่อเนื่อง:', e.message);
        }
    }
}

function startHealthCheckCron() {
    const runChecks = () => {
        checkGCS();
        checkDrive();
    };

    setTimeout(() => {
        runChecks();
        setInterval(runChecks, CHECK_INTERVAL_MS);
    }, FIRST_CHECK_DELAY_MS);

    console.log(`[HealthCheck] Cron scheduled — ตรวจ GCS/Drive ทุก ${CHECK_INTERVAL_MS / 60000} นาที`);
}

module.exports = { startHealthCheckCron };
