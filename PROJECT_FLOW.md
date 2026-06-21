# PROJECT FLOW — ปุ่ม/คำสั่ง → ไฟล์ที่เกี่ยวข้อง

## UI Actions → API → ไฟล์

| ผู้ใช้ทำอะไร | API Route | ไฟล์ Backend | ไฟล์ Frontend |
|---|---|---|---|
| Login | POST `/api/auth/login` | `routes/auth.js` → `models/Admin.js` | `pages/LoginPage.jsx` → `api/auth.js` |
| ดูรายชื่อกลุ่ม (Sidebar) | GET `/api/groups` | `routes/groups.js` → `models/Group.js` | `components/Sidebar/Sidebar.jsx` |
| เลือกวันที่ | GET `/api/dates` | `routes/dates.js` → `models/Message.js` | `components/Sidebar/Sidebar.jsx` |
| ดูข้อความในกลุ่ม | GET `/api/messages` | `routes/messages.js` → `models/Message.js` | `components/ChatWindow/ChatWindow.jsx` |
| Scroll โหลดข้อความเก่า | GET `/api/messages?before=TIMESTAMP` | `routes/messages.js` | `hooks/useMessages.js` |
| Mark / Unmark ข้อความสำคัญ | PATCH `/api/messages/:messageId/important` | `routes/messages.js` | `MessageBubble.jsx` (ดาว ⭐) → `api/messages.js#toggleImportant` |
| ดูเฉพาะข้อความสำคัญ | GET `/api/messages/important?groupId=...` | `routes/messages.js` | `ChatWindow.jsx` (ปุ่ม ⭐ สำคัญ) → `api/messages.js#fetchImportantMessages` |
| กดปุ่ม Summarize (AI) | POST `/api/messages/summarize-day` | `routes/messages.js` → `services/aiService.js` | `components/Sidebar/Sidebar.jsx` → `components/SummaryModal/SummaryModal.jsx` |
| ดูรูป/วิดีโอ | GET `/api/media?path=...` | `routes/media.js` → `services/gcsService.js` | `components/MessageBubble/MessageBubble.jsx` |
| ดูไฟล์ที่อัพโหลด | GET `/api/messages/drive-files` | `routes/messages.js` → `models/Message.js` | `pages/DriveFilesPage.jsx` |
| ข้อความใหม่ (real-time) | WebSocket `new-message` | `sockets/index.js` | `hooks/useSocket.js` |

---

## LINE Bot → ไฟล์

| เหตุการณ์ | ไฟล์ |
|---|---|
| LINE ส่งข้อความเข้ามา | `routes/webhook.js` |
| เก็บรูป/วิดีโอ/เสียง → GCS | `services/gcsService.js` |
| เก็บไฟล์ → Google Drive | `services/driveService.js` |
| ดึงชื่อ/รูป user จาก LINE | `services/lineService.js` |
| แจ้งเตือน admin เมื่อ error | `services/notifyService.js` |

---

## ไฟล์หลัก

| ไฟล์ | หน้าที่ |
|---|---|
| `backend/app.js` | ตั้งค่า Express, register routes ทั้งหมด |
| `backend/config/database.js` | เชื่อมต่อ PostgreSQL (Neon) |
| `backend/models/Message.js` | โครงสร้างข้อความที่เก็บใน DB |
| `backend/services/aiService.js` | เรียก Groq / Gemini สำหรับสรุปบทสนทนา |
| `frontend/src/App.jsx` | ตัวหลักของ frontend, จัดการ state ทั้งหมด |
| `frontend/src/api/messages.js` | ฟังก์ชัน fetch ข้อมูลจาก backend |

---

## ประเภทข้อความ → เก็บที่ไหน

| ประเภท | GCS | Google Drive | แสดงผลด้วย |
|---|---|---|---|
| ข้อความ (text) | - | - | MessageBubble |
| รูปภาพ | ✅ | - | MediaGallery |
| วิดีโอ | ✅ | - | Video player |
| เสียง | ✅ | - | VoiceMessage.jsx |
| ไฟล์ | ✅ | ✅ | FileIcon + link Drive |
| สติกเกอร์ | - | - | รูปจาก LINE CDN |
| Location | - | - | MessageBubble (text) |

---

## Hidden Routes (ไม่มีปุ่มใน UI)

| URL | ใช้ทำอะไร | ไฟล์ |
|---|---|---|
| `/register-admin` | สร้าง admin ครั้งแรก | `pages/RegisterPage.jsx` → `routes/auth.js` |
| `/drive-files` | ดูไฟล์ที่อัพโหลดทั้งหมด | `pages/DriveFilesPage.jsx` |
