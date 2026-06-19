// services/gcsService.js
const { Storage } = require('@google-cloud/storage');

const storage = process.env.GCS_KEY_JSON
    ? new Storage({ credentials: JSON.parse(process.env.GCS_KEY_JSON) })
    : new Storage({ keyFilename: process.env.GCS_KEY_FILE });

const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);

/**
 * กำหนด Content-Type ตามนามสกุลไฟล์
 */
function getContentType(extension) {
    const map = {
        '.jpg':  'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png':  'image/png',
        '.gif':  'image/gif',
        '.mp4':  'video/mp4',
        '.mov':  'video/quicktime',
        '.m4a':  'audio/mp4',
        '.mp3':  'audio/mpeg',
        '.pdf':  'application/pdf',
        '.zip':  'application/zip',
        '.doc':  'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls':  'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return map[extension.toLowerCase()] || 'application/octet-stream';
}

/**
 * สร้าง path ใน GCS แยกตามประเภทและปี/เดือน
 * เช่น "media/images/2024/01/abc123.jpg"
 */
function buildGCSPath(messageId, extension, type) {
    const folderMap = {
        image: 'images',
        video: 'videos',
        audio: 'audios',
        file:  'files',
    };
    const folder = folderMap[type] || 'others';
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');

    return `media/${folder}/${yyyy}/${mm}/${messageId}${extension}`;
}

/**
 * อัพโหลด Buffer ขึ้น GCS
 * @param {Buffer} buffer - ข้อมูลไฟล์
 * @param {string} gcsPath - path ใน bucket เช่น "media/images/2024/01/abc123.jpg"
 * @param {string} extension - นามสกุลไฟล์ เช่น ".jpg"
 * @returns {string} gcsPath ที่เก็บใน GCS
 */
async function uploadToGCS(buffer, gcsPath, extension) {
    const contentType = getContentType(extension);
    const file = bucket.file(gcsPath);

    await file.save(buffer, {
        contentType,
        resumable: false, // ไฟล์เล็กกว่า 5MB ใช้ false เร็วกว่า
    });

    return gcsPath;
}

/**
 * สร้าง Signed URL ชั่วคราวสำหรับดูไฟล์ (Private)
 * @param {string} gcsPath - path ใน bucket
 * @param {number} expiresInMinutes - หมดอายุกี่นาที (default 60 นาที)
 * @returns {string} URL ชั่วคราว
 */
async function getSignedUrl(gcsPath, expiresInMinutes = 60) {
    const file = bucket.file(gcsPath);

    const [url] = await file.getSignedUrl({
        version: 'v2',
        action: 'read',
        expires: Date.now() + expiresInMinutes * 60 * 1000,
    });

    return url;
}

/**
 * สร้าง Signed URL อายุยาว (ถึงปี 2099) สำหรับเก็บใน DB
 * @param {string} gcsPath
 * @returns {{ url: string, expires: string }} url และ ISO date ของ expiry
 */
async function getSignedUrlLong(gcsPath) {
    const file = bucket.file(gcsPath);
    const expires = new Date('2099-12-31T23:59:59Z');
    const [url] = await file.getSignedUrl({
        version: 'v2',
        action: 'read',
        expires,
    });
    return { url, expires: expires.toISOString() };
}

/**
 * ลบไฟล์ออกจาก GCS
 * @param {string} gcsPath - path ใน bucket
 */
async function deleteFromGCS(gcsPath) {
    await bucket.file(gcsPath).delete();
    console.log(`🗑️ ลบไฟล์ออกจาก GCS: ${gcsPath}`);
}

module.exports = {
    uploadToGCS,
    getSignedUrl,
    getSignedUrlLong,
    deleteFromGCS,
    buildGCSPath,
};