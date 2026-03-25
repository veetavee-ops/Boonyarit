/**
 * Migration script: Upload local /media files to GCS + update DB metadata
 * Run once: node scripts/migrate-to-gcs.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { Sequelize, Op } = require('sequelize');
const { Storage } = require('@google-cloud/storage');

const sequelize = require('../config/database');
const Message = require('../models/Message');

const storage = new Storage({ keyFilename: process.env.GCS_KEY_FILE });
const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);

const MEDIA_DIR = path.join(__dirname, '../media');

// ─── Build GCS path using message timestamp (ไม่ใช่วันนี้) ───────────────────
function buildGCSPath(messageId, ext, type, timestamp) {
    const d = new Date(timestamp);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const folderMap = { image: 'images', video: 'videos', audio: 'audios', file: 'files' };
    return `media/${folderMap[type]}/${yyyy}/${mm}/${messageId}${ext}`;
}

// ─── Upload file buffer to GCS ────────────────────────────────────────────────
async function upload(buffer, gcsPath, ext) {
    const mimeMap = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.mp4': 'video/mp4', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg',
        '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.zip': 'application/zip',
    };
    await bucket.file(gcsPath).save(buffer, {
        contentType: mimeMap[ext.toLowerCase()] || 'application/octet-stream',
        resumable: false,
    });
}

// ─── Migrate images ───────────────────────────────────────────────────────────
async function migrateImages() {
    const messages = await Message.findAll({
        where: {
            messageType: 'image',
            metadata: { [Op.contains]: { localPaths: [] } }   // มี localPaths
        }
    });

    // fallback: ดึงทุก image message แล้วกรองเอง
    const allImages = await Message.findAll({ where: { messageType: 'image' } });
    const toMigrate = allImages.filter(m => m.metadata?.localPaths?.length > 0);

    console.log(`\n📷 Images: พบ ${toMigrate.length} messages`);
    let ok = 0, skip = 0, fail = 0;

    for (const msg of toMigrate) {
        const gcsPaths = [];
        let hasError = false;

        for (const lp of msg.metadata.localPaths) {
            const fileName = path.basename(lp);
            const messageId = fileName.replace('.jpg', '');
            const localFile = path.join(MEDIA_DIR, 'images', fileName);

            if (!fs.existsSync(localFile)) {
                console.log(`  ⚠️  ไม่พบไฟล์ ${fileName} — ข้ามไป`);
                hasError = true;
                continue;
            }

            const gcsPath = buildGCSPath(messageId, '.jpg', 'image', msg.timestamp);
            try {
                const buffer = fs.readFileSync(localFile);
                await upload(buffer, gcsPath, '.jpg');
                gcsPaths.push(gcsPath);
            } catch (e) {
                console.error(`  ❌ upload fail: ${fileName}`, e.message);
                hasError = true;
            }
        }

        if (gcsPaths.length > 0) {
            await msg.update({
                metadata: {
                    ...msg.metadata,
                    gcsPaths,
                    localPaths: undefined   // ลบ field เก่า
                }
            });
            ok++;
        } else {
            fail++;
        }
    }

    console.log(`  ✅ สำเร็จ: ${ok}  ❌ ล้มเหลว: ${fail}`);
}

// ─── Migrate videos / audios / files ─────────────────────────────────────────
async function migrateByType(messageType, folder, ext) {
    const messages = await Message.findAll({ where: { messageType } });
    const toMigrate = messages.filter(m => m.metadata?.localPath);

    console.log(`\n${({ video: '🎬', audio: '🎤', file: '📎' }[messageType])} ${messageType}: พบ ${toMigrate.length} messages`);
    let ok = 0, skip = 0, fail = 0;

    for (const msg of toMigrate) {
        const lp = msg.metadata.localPath;
        const fileName = path.basename(lp);
        const localFile = path.join(MEDIA_DIR, folder, fileName);

        if (!fs.existsSync(localFile)) {
            console.log(`  ⚠️  ไม่พบไฟล์ ${fileName} — ข้ามไป`);
            skip++;
            continue;
        }

        const fileExt = path.extname(fileName) || ext;
        const messageId = path.basename(fileName, fileExt);
        const gcsPath = buildGCSPath(messageId, fileExt, messageType, msg.timestamp);

        try {
            const buffer = fs.readFileSync(localFile);
            await upload(buffer, gcsPath, fileExt);
            await msg.update({
                metadata: {
                    ...msg.metadata,
                    gcsPath,
                    localPath: undefined   // ลบ field เก่า
                }
            });
            ok++;
        } catch (e) {
            console.error(`  ❌ upload fail: ${fileName}`, e.message);
            fail++;
        }
    }

    console.log(`  ✅ สำเร็จ: ${ok}  ⚠️  ไม่พบไฟล์: ${skip}  ❌ ล้มเหลว: ${fail}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('🚀 เริ่ม Migration: local /media → GCS');
    console.log(`   Bucket: ${process.env.GCS_BUCKET_NAME}`);

    await sequelize.authenticate();
    console.log('   DB: connected ✅\n');

    await migrateImages();
    await migrateByType('video', 'videos', '.mp4');
    await migrateByType('audio', 'audios', '.m4a');
    await migrateByType('file', 'files', '.bin');

    console.log('\n🎉 Migration เสร็จสมบูรณ์');
    process.exit(0);
}

main().catch(e => {
    console.error('💥 Fatal:', e.message);
    process.exit(1);
});
