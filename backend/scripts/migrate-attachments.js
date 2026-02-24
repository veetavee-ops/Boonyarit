const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const sequelize = require('../config/database');
const { Message } = require('../models/index');
const MessageAttachment = require('../models/MessageAttachment');

const MEDIA_DIR = path.join(__dirname, '..', 'media');
const IMAGES_DIR = path.join(MEDIA_DIR, 'images');

// Ensure directory exists
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

async function migrate() {
    try {
        console.log('🚀 เริ่มต้นการย้ายข้อมูลรูปลงสู่ Local Storage...');

        // Test connection
        await sequelize.authenticate();
        console.log('✅ เชื่อมต่อฐานข้อมูลสำเร็จ');

        // ทยอยดึงรูปภาพทั้งหมดจากฐานข้อมูล (ดึงมาเฉพาะที่มี Message คู่กันอยู่)
        const attachments = await MessageAttachment.findAll({
            order: [['messageId', 'ASC'], ['sequenceNumber', 'ASC']]
        });

        console.log(`📦 พบไฟล์แนบที่เก็บอยู่ใน Database จำนวน ${attachments.length} ไฟล์`);

        if (attachments.length === 0) {
            console.log('✅ ไม่มีไฟล์แนบให้ทำการย้ายข้อมูล');
            process.exit(0);
        }

        // จัดกลุ่มตาม messageId เพราะ 1 ข้อความอาจมีหลายรูป
        const byMessage = {};
        attachments.forEach(att => {
            if (!byMessage[att.messageId]) {
                byMessage[att.messageId] = [];
            }
            byMessage[att.messageId].push(att);
        });

        let successCount = 0;
        let failCount = 0;

        for (const [messageId, attList] of Object.entries(byMessage)) {
            try {
                const message = await Message.findByPk(messageId);
                if (!message) {
                    console.log(`⚠️ ไม่พบข้อความ (ID: ${messageId}) สำหรับไฟล์แนบเหล่านี้ ข้าม...`);
                    continue;
                }

                // จัดการดึง meta เก่ามาเผื่อเอาไว้
                const metadata = message.metadata || {};
                const localPaths = metadata.localPaths || [];

                // Save files
                for (let i = 0; i < attList.length; i++) {
                    const att = attList[i];
                    if (!att.fileData) continue;

                    // ชื่อไฟล์อิงตาม ID ของ attachment หรือ sequence
                    const fileName = `migrated_${att.id}.jpg`;
                    const filePath = path.join(IMAGES_DIR, fileName);

                    // เขียนไฟล์ลง Local disk
                    fs.writeFileSync(filePath, att.fileData);

                    const webPath = `/media/images/${fileName}`;
                    if (!localPaths.includes(webPath)) {
                        localPaths.push(webPath);
                    }
                }

                // Update ข้อความใน DB (ต้องสร้าง Object ใหม่ ไม่งั้น Sequelize จะไม่รู้ว่ามันถูกแก้ไข)
                const newMetadata = {
                    ...metadata,
                    imageCount: localPaths.length,
                    localPaths: localPaths,
                    migratedFromBlob: true
                };

                await message.update({ metadata: newMetadata });
                successCount++;

            } catch (err) {
                console.error(`❌ เกิดข้อผิดพลาดกับ Message ID: ${messageId}`, err.message);
                failCount++;
            }
        }

        console.log(`\n🎉 การย้ายข้อมูลเสร็จสิ้น!`);
        console.log(`- สำเร็จ: ${successCount} ข้อความ`);
        console.log(`- ล้มเหลว: ${failCount} ข้อความ`);
        console.log(`\n💡 คุณสามารถตรวจสอบไฟล์รูปได้ที่โฟลเดอร์: ${IMAGES_DIR}`);
        console.log(`💡 หากทุกอย่างครบถ้วนแล้ว คุณสามารถ DROP TABLE message_attachments ใน Database ทิ้งเพื่อคืนพื้นที่ได้เลยครับ\n`);

    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดแบบไม่คาดคิด:', error);
    } finally {
        process.exit(0);
    }
}

migrate();
