# PROJECT OVERVIEW — LINE OA Boonyarit

> เอกสารนี้อธิบายโครงสร้างทั้งหมดของโปรเจกต์ ใช้สำหรับ onboarding และส่งต่อ context ให้ AI

---

## 1. ภาพรวม

| | |
|---|---|
| **ระบบ** | LINE OA archive + bot + admin dashboard |
| **Production** | https://boonyarit.achalee.com |
| **Server** | DigitalOcean SGP1 — IP `168.144.137.42` |
| **Repo** | github.com/veetavee-ops/Boonyarit |
| **Docker Hub** | veetavee/lineoa |

---

## 2. Architecture

```
Internet
  └── Caddy (port 80/443 — SSL + reverse proxy)
        └── Docker: lineoa-app (port 3000)
              └── Node.js (Express + Socket.IO)
                    ├── REST API (/api/...)
                    ├── LINE Webhook (/webhook)
                    └── Static SPA (frontend build)

Storage
  ├── PostgreSQL  — ข้อความ, user, group, metadata
  ├── GCS         — ไฟล์จริง (รูป, เอกสาร, วิดีโอ, เสียง)
  └── Google Drive — backup ของ GCS (optional, toggle ได้)
```

---

## 3. โครงสร้างโฟลเดอร์

```
Boonyarit/
├── backend/
│   ├── app.js              ← ตั้งค่า Express, register routes
│   ├── server.js           ← entry point, Socket.IO, DB sync
│   ├── config/
│   │   ├── database.js     ← PostgreSQL connection (Sequelize)
│   │   └── cors.js         ← CORS whitelist
│   ├── middleware/
│   │   ├── auth.js         ← JWT verify middleware
│   │   └── logger.js       ← request logger (dev only)
│   ├── models/             ← Sequelize models (ดูหัวข้อ 5)
│   ├── routes/             ← Express routes (ดูหัวข้อ 6)
│   ├── services/           ← business logic (ดูหัวข้อ 7)
│   ├── sockets/
│   │   └── index.js        ← Socket.IO event handlers
│   ├── scripts/            ← one-off migration/utility scripts
│   └── www/                ← frontend build output (SPA)
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx         ← root component, global state
│   │   ├── pages/          ← full-page views (ดูหัวข้อ 9)
│   │   ├── components/     ← UI components (ดูหัวข้อ 9)
│   │   ├── api/            ← fetch wrappers ต่อ resource
│   │   ├── hooks/          ← useSocket.js, useMessages.js
│   │   └── utils/          ← helpers
│   └── vite.config.js
│
├── docker-compose.yml      ← production container config
├── Dockerfile              ← build frontend → copy ไป backend/www/
├── deploy.ps1              ← deploy script (Windows)
└── start.ps1               ← local dev start script
```

---

## 4. Deploy Pipeline

```
git push main
  └── GitHub Actions (.github/workflows/deploy.yml)
        ├── docker build (Dockerfile)
        │     ├── npm run build (frontend → backend/www/)
        │     └── node server.js
        ├── docker push → Docker Hub (veetavee/lineoa:latest)
        └── SSH root@168.144.137.42
              └── docker compose up -d --force-recreate
```

> ⚠️ ใช้ `--force-recreate` เสมอ ไม่ใช่ `restart` — มิฉะนั้น `.env` จะไม่ถูกโหลดใหม่

**GitHub Secrets ที่ต้องมี:**
`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `SERVER_HOST`, `SERVER_USER`, `SERVER_PASSWORD`

---

## 5. Database Models

### Message
| Field | Type | หมายเหตุ |
|---|---|---|
| `id` | UUID (PK) | auto-generated |
| `messageId` | STRING unique | LINE message ID |
| `messageType` | STRING | `text` / `image` / `file` / `video` / `audio` / `sticker` / `location` |
| `timestamp` | DATE | เวลาส่งจาก LINE |
| `userId` | STRING | LINE user ID (FK → User) |
| `groupId` | STRING nullable | LINE group ID (null = DM) |
| `sourceType` | STRING | `group` / `user` |
| `text` | TEXT | เนื้อหาข้อความ (ถ้าเป็น text) |
| `metadata` | JSONB | ข้อมูลแนบ เช่น gcsUrl, fileName, driveFileId |
| `isImportant` | BOOLEAN | mark ดาว ⭐ |

**metadata ตามประเภท:**
```json
// file
{ "fileName": "...", "fileSize": 0, "gcsPath": "...", "gcsUrl": "...", "driveFileId": "..." }
// image (grouped)
{ "imageCount": 3, "gcsPaths": [...], "gcsUrls": [...], "driveFileIds": [...] }
// video / audio
{ "gcsPath": "...", "gcsUrl": "...", "duration": 0, "fileSize": 0 }
// sticker
{ "packageId": "...", "stickerId": "...", "stickerUrl": "..." }
// location
{ "title": "...", "address": "...", "lat": 0, "lng": 0 }
```

### User (LINE users — ลูกค้า)
| Field | Type | หมายเหตุ |
|---|---|---|
| `userId` | STRING (PK) | LINE user ID |
| `displayName` | STRING | ชื่อ LINE |
| `pictureUrl` | TEXT | รูปโปรไฟล์ |
| `canSearch` | BOOLEAN | สิทธิ์ค้นหาเอกสารผ่าน bot (default: false) |

### Admin (ผู้ดูแล dashboard)
| Field | Type | หมายเหตุ |
|---|---|---|
| `id` | UUID (PK) | |
| `username` | STRING unique | |
| `password` | STRING | bcrypt hashed |
| `role` | STRING | `admin` / `user` |

### Group
| Field | Type | หมายเหตุ |
|---|---|---|
| `groupId` | STRING (PK) | LINE group ID |
| `groupName` | STRING | |
| `pictureUrl` | TEXT | |

### AdminGroup
Pivot — กำหนดว่า admin คนไหนเห็น group ไหนได้บ้าง

### Label / GroupLabel
Tag สำหรับ group — ใช้กรองใน sidebar

### Setting
Key-value config — เช่น `drive_enabled = true/false`

---

## 6. API Routes

### Auth
| Method | Path | หน้าที่ | Role |
|---|---|---|---|
| POST | `/api/auth/login` | login → JWT cookie | ทุกคน |
| POST | `/api/auth/logout` | ล้าง cookie | - |
| GET | `/api/auth/me` | ดู session ปัจจุบัน | login แล้ว |

### Groups
| Method | Path | หน้าที่ | Role |
|---|---|---|---|
| GET | `/api/groups` | รายชื่อกลุ่มทั้งหมด | login |
| PATCH | `/api/groups/:id` | แก้ชื่อกลุ่ม | admin |
| DELETE | `/api/groups/:id` | ลบกลุ่ม | admin |

### Messages
| Method | Path | หน้าที่ | Role |
|---|---|---|---|
| GET | `/api/messages` | ดูข้อความ (filter: groupId, date, type) | login |
| GET | `/api/messages/important` | เฉพาะข้อความ isImportant | login |
| GET | `/api/messages/drive-files` | สารบัญไฟล์ทั้งหมด | login |
| PATCH | `/api/messages/:id/important` | toggle ดาว ⭐ | login |
| DELETE | `/api/messages/:id` | ลบข้อความ | admin |
| DELETE | `/api/messages/drive-files` | ลบไฟล์ (Drive + GCS + DB) | admin |
| POST | `/api/messages/summarize-day` | AI สรุปบทสนทนา | login |

### Dates
| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/dates` | วันที่ที่มีข้อความ (สำหรับ date picker) |

### Labels
| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/labels` | รายการ label ทั้งหมด |
| POST | `/api/labels` | สร้าง label |
| POST | `/api/labels/:id/groups` | ผูก label กับ group |
| DELETE | `/api/labels/:id/groups/:gid` | เอา label ออกจาก group |

### Users (Admin accounts)
| Method | Path | หน้าที่ | Role |
|---|---|---|---|
| GET | `/api/users` | รายชื่อ admin | admin |
| POST | `/api/users` | สร้าง admin ใหม่ | admin |
| DELETE | `/api/users/:id` | ลบ admin | admin |

### LINE Users
| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/line-users` | รายชื่อ LINE users ทั้งหมด |
| PATCH | `/api/line-users/:id/can-search` | toggle canSearch |

### Media
| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/media?path=...` | redirect ไป GCS signed URL |

### Settings
| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/settings` | ดู settings ทั้งหมด |
| PUT | `/api/settings/:key` | แก้ค่า setting |

### Webhook (LINE)
| Method | Path | หน้าที่ |
|---|---|---|
| POST | `/webhook` | รับ event จาก LINE platform |

---

## 7. Services

| ไฟล์ | หน้าที่ |
|---|---|
| `gcsService.js` | upload / getSignedUrl / buildGCSPath — Google Cloud Storage |
| `driveService.js` | ensureGroupFolder / uploadFileToDrive / deleteFileFromDrive — Google Drive (OAuth2) |
| `lineService.js` | LINE Bot SDK: getProfile, client (replyMessage, getGroupSummary) |
| `notifyService.js` | alertError / notifyAdmin — แจ้ง admin ผ่าน LINE เมื่อเกิด error |
| `aiService.js` | เรียก Groq/Gemini เพื่อสรุปบทสนทนา |
| `cleanupService.js` | cron job ล้าง signed URL ที่หมดอายุ |

---

## 8. LINE Bot Flow (webhook.js)

```
POST /webhook (LINE event)
  │
  ├── event.type ≠ 'message' → return (ignore)
  │
  ├── sourceType = 'user' (DM) + message.type = 'text'
  │     ├── canSearch = true  → handleUserDMSearch()
  │     │     ├── text match /^ค้นหา\s+(.+)/
  │     │     │     ├── หา groupId ที่ user เคยส่งข้อความ
  │     │     │     ├── ค้น Message WHERE fileName ILIKE '%keyword%'
  │     │     │     └── reply ผลลัพธ์ สูงสุด 5 รายการ (GCS link)
  │     │     └── text ไม่ match → reply วิธีใช้งาน
  │     └── canSearch = false → ignore เงียบๆ
  │
  ├── sourceType = 'group'
  │     └── upsert Group (ดึง groupName จาก LINE)
  │
  ├── sourceType = 'user' (DM ที่ไม่ใช่ text)
  │     └── upsert User profile
  │
  ├── message.type = 'image'
  │     └── handleImageMessage()
  │           ├── groupKey = userId-groupId
  │           ├── pending 5 วินาที (รอรูปชุดเดียวกัน)
  │           └── saveImageGroup() → GCS + Drive + DB update
  │
  └── message.type อื่น (file, video, audio, text, sticker, location)
        └── handleNonImageMessage()
              ├── file → download → GCS + Drive
              ├── video/audio → download → GCS
              └── text/sticker/location → บันทึก metadata เท่านั้น
```

> **หมายเหตุ:** การค้นหาปัจจุบันรองรับเฉพาะไฟล์ใน **group** — ยังไม่รองรับไฟล์ที่ DM มาโดยตรง

---

## 9. Frontend

React + Vite — build output → `backend/www/` (SPA)

### Pages

| ไฟล์ | Path | หน้าที่ |
|---|---|---|
| `LoginPage.jsx` | `/login` | login admin |
| `RegisterPage.jsx` | `/register-admin` | สร้าง admin ครั้งแรก (hidden) |
| `DashboardPage.jsx` | `/` | หน้าหลัก — chat archive |
| `AdminPanel.jsx` | `/admin` | จัดการ admin users |
| `DriveFilesPage.jsx` | popup modal | สารบัญไฟล์ทั้งหมด (เปิดจาก Sidebar) |

### Components

| Component | หน้าที่ |
|---|---|
| `Sidebar` | รายการกลุ่ม/DM, date picker, label filter, ปุ่มสารบัญ |
| `ChatWindow` | แสดง message list ของกลุ่มที่เลือก, infinite scroll |
| `MessageBubble` | render message แต่ละชนิด (text/file/image/video/sticker/location) |
| `MediaGallery` | ดูรูปภาพแบบ gallery |
| `SummaryModal` | popup แสดงผล AI summary |
| `Avatar` | รูปโปรไฟล์ group/user |

### API Layer (`api/`)

| ไฟล์ | ครอบคลุม |
|---|---|
| `auth.js` | login, logout, me |
| `messages.js` | fetchMessages, toggleImportant, deleteMessage, fetchDriveFiles, deleteDriveFiles, summarizeDay |
| `users.js` | listAdmins, createAdmin, deleteAdmin |
| `lineUsers.js` | listLineUsers, toggleCanSearch |
| `labels.js` | listLabels, createLabel, assignLabel, removeLabel |
| `settings.js` | getSettings, updateSetting |

### Hooks

| Hook | หน้าที่ |
|---|---|
| `useSocket.js` | เชื่อม Socket.IO รับ `new-message` → อัปเดต UI real-time |
| `useMessages.js` | จัดการ fetch + infinite scroll + state ของ message list |

---

## 10. ประเภทไฟล์ → เก็บที่ไหน

| ประเภท | PostgreSQL | GCS | Google Drive |
|---|---|---|---|
| text | ✅ (text field) | — | — |
| image | ✅ (metadata) | ✅ | ✅ (ถ้า drive_enabled) |
| file | ✅ (metadata) | ✅ | ✅ (ถ้า drive_enabled) |
| video | ✅ (metadata) | ✅ | — |
| audio | ✅ (metadata) | ✅ | — |
| sticker | ✅ (metadata) | — | — |
| location | ✅ (metadata) | — | — |

---

## 11. Environment Variables

```env
# LINE OA
CHANNEL_ACCESS_TOKEN=
CHANNEL_SECRET=

# Database
DATABASE_URL=postgres://...
DB_SSL=true

# Google Cloud Storage
GCS_BUCKET=
GOOGLE_APPLICATION_CREDENTIALS=/app/config/gcs-key.json

# Google Drive (backup — optional)
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=

# Auth
JWT_SECRET=

# App
PORT=3000
NODE_ENV=production

# Notify (LINE token สำหรับแจ้ง admin)
ADMIN_NOTIFY_TOKEN=
```

---

## 12. Admin Role Permissions

| Action | role: `user` | role: `admin` |
|---|---|---|
| ดู chat / ไฟล์ | ✅ | ✅ |
| mark สำคัญ ⭐ | ✅ | ✅ |
| ลบข้อความ | ❌ | ✅ |
| ลบไฟล์ Drive/GCS | ❌ | ✅ |
| จัดการ group | ❌ | ✅ |
| จัดการ admin users | ❌ | ✅ |

---

## 13. ทิศทางพัฒนาต่อ (Roadmap)

### Tier 1 — ฟรี (กำลังพัฒนา)
- ลูกค้า DM ไฟล์มาให้บอท → บอทเก็บลง GCS ไว้ให้
- พิมพ์ "ค้นหา [คำ]" → บอทดึงไฟล์ของตัวเองมาแสดง
- จำกัด 10 ไฟล์/คน

### Tier 2 — Upgrade (แผนอนาคต)
- เข้าถึง dashboard ส่วนตัว (เห็นเฉพาะ chat/ไฟล์ของตัวเอง)
- ไม่จำกัดจำนวนไฟล์
- ระบบ login แยกจาก admin

**สิ่งที่ต้องสร้างสำหรับ Tier 1:**

| # | Feature | สถานะ |
|---|---|---|
| 1 | แก้ search ให้หาไฟล์ DM ได้ (ตอนนี้หาแค่ group) | ❌ |
| 2 | จำกัด 10 ไฟล์/คน + แจ้งเตือนเมื่อเต็ม | ❌ |
| 3 | เปิด canSearch อัตโนมัติเมื่อส่งไฟล์ครั้งแรก | ❌ |
| 4 | ข้อความต้อนรับ / วิธีใช้ เมื่อ add friend | ❌ |
