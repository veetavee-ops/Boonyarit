// require('dotenv').config();
// const express = require('express');
// const line = require('@line/bot-sdk');
// const fs = require('fs');

// const app = express();

// const config = {
//     channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
//     channelSecret: process.env.CHANNEL_SECRET,
// };

// let client;
// try {
//     if (!config.channelAccessToken || !config.channelSecret) {
//         console.warn("WARNING: CHANNEL_ACCESS_TOKEN or CHANNEL_SECRET is missing. LINE Bot features will not work.");
//     } else {
//         client = new line.Client(config);
//     }
// } catch (err) {
//     console.error("Failed to initialize LINE Client:", err);
// }

// // Load existing messages or initialize empty array
// let savedMessages = [];
// try {
//     if (fs.existsSync('messages.json')) {
//         savedMessages = JSON.parse(fs.readFileSync('messages.json', 'utf8'));
//     }
// } catch (err) {
//     console.error('Error loading messages:', err);
// }

// const middleware = config.channelSecret ? line.middleware(config) : (req, res, next) => next();

// app.post('/webhook', middleware, (req, res) => {
//     Promise
//         .all(req.body.events.map(handleEvent))
//         .then((result) => res.json(result))
//         .catch((err) => {
//             console.error(err);
//             res.status(500).end();
//         });
// });

// async function handleEvent(event) {
//     if (event.type !== 'message' || event.message.type !== 'text') {
//         // ignore non-text-message event
//         return Promise.resolve(null);
//     }

//     // Check if message is from a group
//     const sourceType = event.source.type; // 'user', 'group', or 'room'
//     const groupId = event.source.groupId || null;
//     const userId = event.source.userId;
//     const messageText = event.message.text;
//     const timestamp = event.timestamp;

//     // console.log("data", event);


//     // console.log(`Received message from ${sourceType}: ${messageText}`);
//     let userProfile = null;
//     if (client) {
//         try {
//             if (sourceType === 'user') {
//                 // กรณีแชทส่วนตัว
//                 userProfile = await client.getProfile(userId);
//             } else if (sourceType === 'group' && groupId) {
//                 // กรณีในกลุ่ม
//                 userProfile = await client.getGroupMemberProfile(groupId, userId);
//             } else if (sourceType === 'room') {
//                 // กรณีในห้อง
//                 userProfile = await client.getRoomMemberProfile(event.source.roomId, userId);
//             }

//             console.log('User Profile:', userProfile);
//             console.log(`ชื่อ: ${userProfile.displayName}`);
//             console.log(`รูปโปรไฟล์: ${userProfile.pictureUrl}`);
//             console.log(`Status: ${userProfile.statusMessage || 'ไม่มี'}`);
//         } catch (err) {
//             console.error('Error fetching user profile:', err);
//         }
//     }

//     // Save the message
//     const newMessage = {
//         timestamp: new Date(timestamp).toISOString(),
//         sourceType,
//         groupId,
//         userId,
//         text: messageText
//     };

//     savedMessages.push(newMessage);

//     // Write to file (in a real app, use a database)
//     fs.writeFile('messages.json', JSON.stringify(savedMessages, null, 2), (err) => {
//         if (err) console.error('Error saving message:', err);
//     });

//     // Echo the message back (optional, but good for testing)
//     // return client.replyMessage(event.replyToken, {
//     //   type: 'text',
//     //   text: `Saved: ${messageText}`
//     // });
//     return Promise.resolve(null);
// }

// const port = process.env.PORT || 3001;
// app.listen(port, () => {
//     console.log(`listening on ${port}`);
// });

require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');

const app = express();

const config = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET,
};

let client;
try {
    if (!config.channelAccessToken || !config.channelSecret) {
        console.warn("WARNING: CHANNEL_ACCESS_TOKEN or CHANNEL_SECRET is missing. LINE Bot features will not work.");
    } else {
        client = new line.Client(config);
    }
} catch (err) {
    console.error("Failed to initialize LINE Client:", err);
}

// สร้างโฟลเดอร์สำหรับเก็บไฟล์
const MEDIA_DIR = path.join(__dirname, 'media');


if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

// Load existing messages or initialize empty array
let savedMessages = [];
try {
    if (fs.existsSync('messages.json')) {
        savedMessages = JSON.parse(fs.readFileSync('messages.json', 'utf8'));
    }
} catch (err) {
    console.error('Error loading messages:', err);
}

const middleware = config.channelSecret ? line.middleware(config) : (req, res, next) => next();

app.post('/webhook', middleware, (req, res) => {
    Promise
        .all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});
// เพิ่ม express.json() และ express.urlencoded() ถ้ายังไม่มี
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// ฟังก์ชันดาวน์โหลดและบันทึกไฟล์
async function downloadContent(messageId, fileExtension = '') {
    if (!client) return null;

    try {
        const stream = await client.getMessageContent(messageId);
        const fileName = `${messageId}${fileExtension}`;
        const filePath = path.join(MEDIA_DIR, fileName);

        return new Promise((resolve, reject) => {
            const writable = fs.createWriteStream(filePath);
            stream.pipe(writable);

            writable.on('finish', () => {
                console.log(`✅ บันทึกไฟล์: ${filePath}`);
                resolve(filePath);
            });

            writable.on('error', reject);
        });
    } catch (err) {
        console.error('Error downloading content:', err);
        return null;
    }
}

// ฟังก์ชันดึงข้อมูล User Profile
async function getUserProfile(event) {
    if (!client) return null;

    const { source } = event;
    try {
        switch (source.type) {
            case 'user':
                return await client.getProfile(source.userId);
            case 'group':
                return await client.getGroupMemberProfile(source.groupId, source.userId);
            case 'room':
                return await client.getRoomMemberProfile(source.roomId, source.userId);
            default:
                return null;
        }
    } catch (err) {
        console.error('Error getting user profile:', err);
        return null;
    }
}

async function handleEvent(event) {
    // รับเฉพาะ message events
    if (event.type !== 'message') {
        return Promise.resolve(null);
    }

    const sourceType = event.source.type;
    const groupId = event.source.groupId || null;
    const roomId = event.source.roomId || null;
    const userId = event.source.userId;
    const timestamp = event.timestamp;
    const messageId = event.message.id;
    const messageType = event.message.type;

    console.log('\n' + '='.repeat(50));
    console.log(`📨 ได้รับข้อความประเภท: ${messageType}`);
    console.log('='.repeat(50));

    // ดึงข้อมูลผู้ส่ง
    const userProfile = await getUserProfile(event);
    if (userProfile) {
        console.log(`👤 ผู้ส่ง: ${userProfile.displayName}`);
        console.log(`🆔 User ID: ${userId}`);
    }

    let messageData = {
        timestamp: new Date(timestamp).toISOString(),
        sourceType,
        groupId,
        roomId,
        userId,
        userName: userProfile?.displayName || 'Unknown',
        messageId,
        messageType,
    };

    // จัดการแต่ละประเภทของข้อความ
    switch (messageType) {
        case 'text':
            console.log(`💬 ข้อความ: ${event.message.text}`);
            messageData.text = event.message.text;

            // เช็คว่ามี URL ไหม
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const urls = event.message.text.match(urlRegex);
            if (urls) {
                console.log(`🔗 พบลิงก์: ${urls.join(', ')}`);
                messageData.urls = urls;
            }
            break;

        case 'image':
            console.log(`🖼️  รูปภาพ`);
            console.log(`📥 Message ID: ${messageId}`);

            // ดาวน์โหลดรูป
            const imagePath = await downloadContent(messageId, '.jpg');
            if (imagePath) {
                messageData.imagePath = imagePath;
                console.log(`💾 บันทึกไว้ที่: ${imagePath}`);
            }

            // ดึง URL สำหรับดูรูป (จะหมดอายุ)
            if (client) {
                try {
                    const contentUrl = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
                    messageData.contentUrl = contentUrl;
                    console.log(`🌐 URL: ${contentUrl}`);
                } catch (err) {
                    console.error('Error getting image URL:', err);
                }
            }
            break;

        case 'video':
            console.log(`🎥 วิดีโอ`);
            console.log(`📥 Message ID: ${messageId}`);
            console.log(`⏱️  ความยาว: ${event.message.duration || 'ไม่ระบุ'} ms`);

            // ดาวน์โหลดวิดีโอ
            const videoPath = await downloadContent(messageId, '.mp4');
            if (videoPath) {
                messageData.videoPath = videoPath;
                messageData.duration = event.message.duration;
                console.log(`💾 บันทึกไว้ที่: ${videoPath}`);
            }
            break;

        case 'audio':
            console.log(`🎵 เสียง`);
            console.log(`📥 Message ID: ${messageId}`);
            console.log(`⏱️  ความยาว: ${event.message.duration || 'ไม่ระบุ'} ms`);

            const audioPath = await downloadContent(messageId, '.m4a');
            if (audioPath) {
                messageData.audioPath = audioPath;
                messageData.duration = event.message.duration;
                console.log(`💾 บันทึกไว้ที่: ${audioPath}`);
            }
            break;

        case 'file':
            console.log(`📎 ไฟล์`);
            console.log(`📥 Message ID: ${messageId}`);
            console.log(`📄 ชื่อไฟล์: ${event.message.fileName}`);
            console.log(`📊 ขนาด: ${(event.message.fileSize / 1024 / 1024).toFixed(2)} MB`);

            // ดาวน์โหลดไฟล์ (ใช้นามสกุลจากชื่อไฟล์)
            const fileExt = path.extname(event.message.fileName);
            const filePath = await downloadContent(messageId, fileExt);
            if (filePath) {
                messageData.filePath = filePath;
                messageData.fileName = event.message.fileName;
                messageData.fileSize = event.message.fileSize;
                console.log(`💾 บันทึกไว้ที่: ${filePath}`);
            }
            break;

        case 'location':
            console.log(`📍 ตำแหน่ง`);
            console.log(`🏷️  ชื่อสถานที่: ${event.message.title || 'ไม่ระบุ'}`);
            console.log(`📌 ที่อยู่: ${event.message.address || 'ไม่ระบุ'}`);
            console.log(`🗺️  พิกัด: ${event.message.latitude}, ${event.message.longitude}`);

            messageData.location = {
                title: event.message.title,
                address: event.message.address,
                latitude: event.message.latitude,
                longitude: event.message.longitude,
            };
            break;

        case 'sticker':
            console.log(`😀 สติกเกอร์`);
            console.log(`🆔 Package ID: ${event.message.packageId}`);
            console.log(`🆔 Sticker ID: ${event.message.stickerId}`);
            console.log(`📦 Sticker Resource Type: ${event.message.stickerResourceType}`);

            messageData.sticker = {
                packageId: event.message.packageId,
                stickerId: event.message.stickerId,
                stickerResourceType: event.message.stickerResourceType,
            };

            // URL ดูสติกเกอร์
            const stickerUrl = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${event.message.stickerId}/android/sticker.png`;
            messageData.sticker.url = stickerUrl;
            console.log(`🌐 URL: ${stickerUrl}`);
            break;

        default:
            console.log(`❓ ประเภทข้อความอื่นๆ: ${messageType}`);
            console.log('📋 ข้อมูลเต็ม:', JSON.stringify(event.message, null, 2));
            messageData.rawMessage = event.message;
            break;
    }

    console.log('='.repeat(50) + '\n');

    // บันทึกข้อความ
    savedMessages.push(messageData);

    // Write to file
    fs.writeFile('messages.json', JSON.stringify(savedMessages, null, 2), (err) => {
        if (err) console.error('Error saving message:', err);
        else console.log('✅ บันทึกข้อมูลลง messages.json แล้ว');
    });

    return Promise.resolve(null);
}

// เพิ่ม endpoint ดูข้อความทั้งหมด
app.get('/messages', (req, res) => {
    res.json(savedMessages);
});

// เพิ่ม endpoint ดูไฟล์สื่อ
app.use('/media', express.static(MEDIA_DIR, {
    dotfiles: 'ignore',
    index: false, // ไม่ใช้ index.html
    setHeaders: (res, path) => {
        // กำหนด Content-Type ตามนามสกุลไฟล์
        if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
            res.set('Content-Type', 'image/jpeg');
        } else if (path.endsWith('.png')) {
            res.set('Content-Type', 'image/png');
        } else if (path.endsWith('.mp4')) {
            res.set('Content-Type', 'video/mp4');
        } else if (path.endsWith('.pdf')) {
            res.set('Content-Type', 'application/pdf');
        } else if (path.endsWith('.m4a')) {
            res.set('Content-Type', 'audio/x-m4a');
        }
    }
}));

// Endpoint แสดงรายการไฟล์ทั้งหมด
app.get('/media', (req, res) => {
    try {
        const files = fs.readdirSync(MEDIA_DIR);

        if (files.length === 0) {
            return res.send(`
                <h1>📂 Media Files</h1>
                <p>ยังไม่มีไฟล์ในโฟลเดอร์</p>
                <p>ส่งรูป/วิดีโอ/ไฟล์มาที่ LINE Bot เพื่อทดสอบ</p>
            `);
        }

        const fileList = files.map(file => {
            const filePath = path.join(MEDIA_DIR, file);
            const stats = fs.statSync(filePath);
            const ext = path.extname(file).toLowerCase();

            let preview = '';
            if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
                preview = `<img src="/media/${file}" style="max-width: 200px; max-height: 200px;">`;
            } else if (ext === '.mp4') {
                preview = `<video width="200" controls><source src="/media/${file}" type="video/mp4"></video>`;
            } else if (ext === '.m4a') { // <--- เพิ่มตัวเล่นเสียงตรงนี้
                preview = `<audio controls style="width: 200px; display: block;"><source src="/media/${file}" type="audio/mp4"></audio>`;
            }

            return `
                <div style="border: 1px solid #ccc; padding: 10px; margin: 10px; display: inline-block;">
                    <h3>${file}</h3>
                    ${preview}
                    <p>ขนาด: ${(stats.size / 1024).toFixed(2)} KB</p>
                    <p>วันที่: ${stats.birthtime.toLocaleString('th-TH')}</p>
                    <a href="/media/${file}" target="_blank">ดาวน์โหลด</a>
                </div>
            `;
        }).join('');

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Media Files</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h1 { color: #06c; }
                </style>
            </head>
            <body>
                <h1>📂 Media Files (${files.length} ไฟล์)</h1>
                <p><a href="/">← กลับหน้าหลัก</a> | <a href="/messages">ดูข้อความทั้งหมด</a> | <a href="/files">ดูรายละเอียดไฟล์ (JSON)</a></p>
                <hr>
                ${fileList}
            </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send(`Error: ${err.message}`);
    }
});

// เพิ่ม Endpoint ดูรายละเอียดไฟล์แบบ JSON
app.get('/files', (req, res) => {
    try {
        const files = fs.readdirSync(MEDIA_DIR);
        const fileDetails = files.map(file => {
            const filePath = path.join(MEDIA_DIR, file);
            const stats = fs.statSync(filePath);
            return {
                name: file,
                size: stats.size,
                sizeKB: (stats.size / 1024).toFixed(2),
                created: stats.birthtime,
                url: `http://localhost:${port}/media/${file}`,
                fullPath: path.resolve(filePath)
            };
        });
        res.json({
            totalFiles: files.length,
            directory: path.resolve(MEDIA_DIR),
            files: fileDetails
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// หน้าแรก
app.get('/', (req, res) => {
    const mediaCount = fs.existsSync(MEDIA_DIR) ? fs.readdirSync(MEDIA_DIR).length : 0;
    const messageCount = savedMessages.length;

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>LINE Bot Dashboard</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    padding: 20px;
                    max-width: 800px;
                    margin: 0 auto;
                }
                h1 { color: #06c; }
                .card {
                    border: 1px solid #ddd;
                    padding: 20px;
                    margin: 10px 0;
                    border-radius: 5px;
                }
                .stat { 
                    font-size: 48px; 
                    font-weight: bold; 
                    color: #06c;
                }
                a { 
                    color: #06c; 
                    text-decoration: none;
                    margin-right: 15px;
                }
                a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <h1>🤖 LINE Bot Dashboard</h1>
            
            <div class="card">
                <h2>📊 สถิติ</h2>
                <p>💬 ข้อความทั้งหมด: <span class="stat">${messageCount}</span></p>
                <p>📁 ไฟล์สื่อ: <span class="stat">${mediaCount}</span></p>
            </div>
            
            <div class="card">
                <h2>🔗 ลิงก์</h2>
                <p>
                    <a href="/messages">📋 ดูข้อความทั้งหมด (JSON)</a><br>
                    <a href="/media">🖼️ ดูไฟล์สื่อ (Gallery)</a><br>
                    <a href="/files">📄 ดูรายละเอียดไฟล์ (JSON)</a>
                </p>
            </div>
            
            <div class="card">
                <h2>ℹ️ ข้อมูล Server</h2>
                <p>🌐 Port: ${port}</p>
                <p>📂 Media Directory: ${path.resolve(MEDIA_DIR)}</p>
                <p>⏰ เวลา: ${new Date().toLocaleString('th-TH')}</p>
            </div>
        </body>
        </html>
    `);
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
    console.log(`🚀 Server listening on port ${port}`);
    console.log(`📂 Media files will be saved to: ${MEDIA_DIR}`);
});