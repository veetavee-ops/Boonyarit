# LINE OA V2 — Claude Instructions

**อ่านไฟล์เหล่านี้ก่อนทำงานทุกครั้ง:**
1. `PROJECT_HANDOFF.md` — credentials, setup, สิ่งที่ทำแล้ว, roadmap (ถ้ายังไม่มี `.md` ให้อ่าน `PROJECT_HANDOFF.html` แทน)
2. `PROJECT_FLOW.md` — map ปุ่ม/คำสั่ง → ไฟล์ที่เกี่ยวข้อง

## Quick Reference
- Working dir: `D:\_888_230626_Dev Project\Boonyarit\` (drive letter เปลี่ยนได้)
- Backend: port 3000 | Frontend: port 5173 | ngrok: `hendrix-vizarded-irina.ngrok-free.dev`
- Repo: `veetavee-ops/Boonyarit` (V1 ห้ามแตะ: `CODEPRO-team/mydev_line_oa`)
- Production: `https://boonyarit.achalee.com` — DigitalOcean SGP1, IP `168.144.137.42`

## Memory
- เมื่อผู้ใช้สั่ง `mem` ให้บันทึกลงไฟล์ในโปรเจกต์โดยตรง **ไม่ใช่** `C:\Users\..\.claude\` (เพราะไม่ตามไปเมื่อย้ายเครื่อง)
- บันทึกลง `PROJECT_HANDOFF.md` หรือสร้างไฟล์ใหม่ในโปรเจกต์ตามความเหมาะสม

### สิ่งที่จำเกี่ยวกับผู้ใช้
- ผู้ใช้กำลังหัดเขียนโปรแกรม — ก่อนสร้างไฟล์ใหม่ทุกครั้งให้ถามว่า "ต้องการให้ใส่ comment อธิบายทุกบรรทัดไหมครับ?" (comment แบบภาษาคนว่าสั่งให้ทำอะไร ไม่ใช่แปล syntax)

### สิ่งที่จำเกี่ยวกับโปรเจกต์
- `PROJECT_HANDOFF.md` = Claude อ่าน (ประหยัด token) | `PROJECT_HANDOFF.html` = คนอ่านใน browser
- แก้ไฟล์ใดไฟล์หนึ่งต้องแจ้งให้ไปแก้อีกไฟล์ด้วยเสมอ
- โปรเจกต์อยู่บน **movable/external drive** — drive letter เปลี่ยนตาม PC ที่ต่อ (e:, k:, ฯลฯ) ห้ามสงสัยหรือแก้ path ใน handoff files เพราะ letter ต่างกันเป็นเรื่องปกติ ให้ใช้ working directory จริงตอนนั้นเป็นหลัก

## Rules
- แนวทาง: Copy V1 → test run ผ่าน → develop features ใหม่ อย่า rewrite จาก scratch
- ห้าม commit `.env` และ `backend/config/gcs-key.json`
- ใช้ PowerShell (Windows)

---

## Session Status

### อัพเดท: 24 มิถุนายน 2569 (session 5)

### ✅ Session 1 — Repo rename + Image Drive upload fix (24 มิ.ย. 69)

**Repo rename:**
- `kpp_line_OA` → `Boonyarit` บน GitHub (veetavee-ops)
- Production ไม่กระทบ เพราะ Docker Hub image name (`veetavee/lineoa`) แยกจาก repo name
- Clone ใหม่ที่ `D:\_888_230626_Dev Project\Boonyarit\`

**Bug fix — รูปไม่ขึ้น Google Drive:**
- Root cause: `saveImageGroup()` ไม่มี try-catch แยก GCS จาก Drive → GCS ล้มเหลวทำให้ Drive ไม่ได้รันเลย
- Pattern ถูกต้อง: ไฟล์มี try-catch แยก GCS/Drive มาตั้งแต่เดิม → ไฟล์จึงขึ้น Drive ได้แม้ GCS พัง
- Fix: แยก try-catch GCS และ Drive ใน `saveImageGroup()` ให้เหมือน `handleNonImageMessage`
- Commits: `3dae0d8` → `b429fad` → `4d5502a`

### ✅ Session 2 — Deploy pipeline fix ครบวงจร (24 มิ.ย. 69)

**ปัญหาที่เจอและแก้ไข (ตามลำดับ):**

1. **DOCKERHUB_TOKEN หมดอายุ** → สร้างใหม่แบบ No expiration ที่ hub.docker.com
2. **GitHub Secrets หายหมด** → repo rename ไม่ได้ copy secrets มาด้วย ต้องสร้างใหม่ทุกตัว
3. **SSH PasswordAuthentication ถูกปิด** → Ubuntu 24.04 cloud-init ปิดไว้ใน `/etc/ssh/sshd_config.d/` ต้องแก้ 2 ไฟล์แล้ว `systemctl restart ssh`
4. **ไม่มี .env บน server** → ต้องสร้างมือที่ `/home/worker/lineoa-dev/.env` ครั้งแรก
5. **Port 80 ชนกับ Caddy** → แก้ docker-compose.yml จาก `80:3000` → `3000:3000` (Caddy จัดการ SSL และ reverse proxy ไป port 3000)

**GitHub Secrets ที่ต้องมีครบ 5 ตัว:**
- `DOCKERHUB_USERNAME` = `veetavee`
- `DOCKERHUB_TOKEN` = No expiration (สร้างจาก hub.docker.com)
- `SERVER_HOST` = `168.144.137.42`
- `SERVER_USER` = `root`
- `SERVER_PASSWORD` = (ดูใน Google Drive .env โปรเจกต์ Boonyarit)

**Production Server Architecture:**
```
Internet → Caddy (port 80/443) → localhost:3000 → Docker container (lineoa-app)
```
- Caddy config: `/etc/caddy/Caddyfile`
- App dir: `/home/worker/lineoa-dev/` (มี docker-compose.yml + .env)
- SSH user: `root` | Password: ดูใน Drive

**บทเรียน / แนวทางป้องกัน:**
- Docker Hub token → สร้างแบบ **No expiration** เสมอ
- เมื่อ rename/สร้าง repo ใหม่ → Secrets ไม่ตามมา ต้องเพิ่มใหม่ทุกตัว
- Credentials ทั้งหมดบันทึกไว้ใน **Google Drive → Boonyarit/.env** ผ่าน `/creds` และ `/addcreds`
- ถ้า deploy ไม่มีผล → เช็ค Actions ก่อนเสมอ
- Ubuntu 24.04 ปิด SSH password auth by default → ต้องแก้ sshd_config.d ก่อน setup ครั้งแรก

### ✅ Session 2 ต่อ — GCS key + Drive token fix

**GCS key:**
- `gcs-key.json` ไม่ได้อยู่ใน Docker image → ต้อง mount เป็น volume
- SCP ขึ้น server: `scp backend/config/gcs-key.json root@168.144.137.42:/home/worker/lineoa-dev/gcs-key.json`
- เพิ่ม volume mount ใน docker-compose.yml: `/home/worker/lineoa-dev/gcs-key.json:/app/config/gcs-key.json`

**Drive `invalid_grant`:**
- Root cause: OAuth app อยู่ใน **Testing mode** → refresh token หมดอายุทุก **7 วัน**
- ถ้าเจอ `invalid_grant` ใน log → token หมดอายุ ต้องต่ออายุ
- แก้ชั่วคราว: `cd backend && node scripts/refresh-drive-token.js` (รันบนเครื่อง, เปิด browser login Google)
- **แก้ถาวรแล้ว (Session 3)**: OAuth → Production + script ใช้ localhost:9999 แทน OOB

**สำคัญ:** รูป/ไฟล์ที่เห็นใน UI มาจาก **database** ไม่ใช่ GCS/Drive — GCS/Drive คือ backup เท่านั้น ถ้า upload พัง UI ยังทำงานได้ปกติ

### ✅ Session 3 — gdrive-sa.json + Drive token fix (24 มิ.ย. 69)

**gdrive-sa.json — ใช้ได้ทุกเครื่องโดยไม่เก็บบนเครื่อง:**
- ดึง `gcs-key.json` จาก production server ผ่าน SCP → upload ขึ้น Drive `_claude-config/gdrive-sa.json` (file ID: `1IHOmqcAhEQawVjey-k7BaGmFMYypSxqz`)
- แก้ `~/.claude/scripts/gdrive-update.py` ให้รับ `--sa-key` argument + เปลี่ยน scope เป็น `drive` (จาก `drive.file`)
- แก้ `~/.claude/commands/mem.md` ให้ download sa.json จาก Drive → ใช้ → ลบทิ้ง (ไม่เก็บบนเครื่องถาวร)
- Share "MY DEV CREDENTIALS" folder กับ `boonyarit-bot-storage@tax-ocr-498513.iam.gserviceaccount.com` (Editor)

**Drive OAuth token fix — แก้ถาวรแล้ว:**
- เปลี่ยน OAuth consent screen: **Testing → Production** (token ไม่หมดทุก 7 วันอีกต่อไป)
- แก้ `backend/scripts/refresh-drive-token.js` ให้ใช้ local HTTP server port 9999 แทน OOB (deprecated)
- ได้ refresh token ใหม่ → อัปเดตบน server + restart + อัปเดต Drive backup

### ✅ Session 4 — Drive invalid_grant root cause + แก้ถาวร (24 มิ.ย. 69)

**GCS — ยืนยันว่าทำงานได้แล้ว:**
- ทดสอบ `file.save()` และ `getSignedUrl()` ตรงๆ จาก container → ผ่านทั้งคู่
- `bucket.exists()` fails เป็น expected behavior (SA ไม่มี `storage.buckets.get`) — ไม่ใช่ bug
- Commit: `de9fbf9`

**Root cause ของ Drive invalid_grant:**
1. `driveService.js` ใช้ `'urn:ietf:wg:oauth:2.0:oob'` เป็น redirect_uri → Google deprecated OOB ตั้งแต่ 2022 → token refresh ล้มเหลวเสมอ
2. `docker compose restart` ไม่ reload `.env` → container ใช้ token เก่าตลอด แม้ .env ถูกอัปเดตแล้ว

**แก้แล้ว:**
- เปลี่ยน `driveService.js` redirect_uri → `'http://localhost:9999'` (commit `de9fbf9`, deployed)
- รัน `node scripts/refresh-drive-token.js` → token ใหม่
- อัปเดต `.env` บน server ด้วย Python stdin
- `docker compose up -d --force-recreate` → โหลด token ใหม่จริง
- ทดสอบแล้ว: Drive token OK + Drive upload OK

**อัปเดต token บน server (วิธีที่ถูกต้อง):**
```bash
# Python stdin — ปลอดภัยกว่า sed (sed มีปัญหากับ // ใน token)
$script = @"
import re
with open('/home/worker/lineoa-dev/.env', 'r') as f: c = f.read()
c = re.sub(r'^GOOGLE_DRIVE_REFRESH_TOKEN=.*', 'GOOGLE_DRIVE_REFRESH_TOKEN=NEW_TOKEN', c, flags=re.MULTILINE)
with open('/home/worker/lineoa-dev/.env', 'w') as f: f.write(c)
"@
$script | ssh root@168.144.137.42 "python3"
# แล้ว force-recreate ไม่ใช่ restart!
ssh root@168.144.137.42 "docker compose -f /home/worker/lineoa-dev/docker-compose.yml up -d --force-recreate"
```

### ✅ Session 5 — สารบัญ DriveFilesPage ยกเครื่องใหม่ (24 มิ.ย. 69)

**แสดงไฟล์ครบ + DM + เวลา (commit `06112e1`):**
- เพิ่ม `messageType: ['file', 'image']` ใน query (เดิมมีแค่ file)
- filter เปลี่ยนเป็น `driveFileId || driveFileIds?.length > 0` รองรับทั้ง 2 ประเภท
- handle `private_` groupId ใน drive-files endpoint (DM ขึ้นสารบัญได้)
- เอา `isPrivate` filter ออกจาก frontend dropdown
- เพิ่มเวลา (hour:minute) ในคอลัมน์วันที่

**ลบไฟล์จากสารบัญ (commit `60360be`):**
- `driveService.js`: เพิ่ม `deleteFileFromDrive(fileId)` — Drive delete ทำใน JS ได้เลย (ไม่ต้อง Python)
- `DELETE /api/messages/drive-files`: ลบ Drive + GCS + ล้าง metadata ใน DB
- Frontend: แท็บ ทั้งหมด/รูปภาพ/เอกสาร/อื่นๆ พร้อม count
- Checkbox เลือกรายการ / click แถว toggle / select all
- ปุ่มลบ + confirm modal (ESC/backdrop ปิดได้, default focus = ยกเลิก)

**สารบัญเป็น popup modal (commit `8f2a350`):**
- `DriveFilesPage` รับ `onClose` prop — render เป็น overlay modal แทน full page
- เอา `/drive-files` route ออกจาก App.jsx ใช้ `showDriveFiles` state แทน
- Sidebar กดปุ่มสารบัญ → `onOpenDriveFiles()` ไม่ navigate ออกไป
- ปิดด้วย X / ESC / click backdrop
- "เปิด Google Drive" + "เปิด ↗" ทุกไฟล์ → `window.open()` popup แทน new tab

**หมายเหตุสำคัญ:**
- รูปเก่าในDriveที่ส่งก่อน token fix → DB ไม่มี `driveFileIds` → ไม่ขึ้นสารบัญ (ต้อง backfill script ถ้าต้องการ)
- Drive delete ใน JS ทำได้แล้วเพราะ token fix session 4 — ไม่ต้องพึ่ง Python script

### 🟡 ถัดไป

1. **ทดสอบลบไฟล์** — ลองเลือกลบในสารบัญ เช็คว่าหายจาก Drive + GCS จริง
2. **Backfill script** (optional) — รูปเก่าใน Drive ที่ DB ไม่มี driveFileIds → scan Drive มา match กับ DB
3. **ถ้าต้อง refresh token ในอนาคต** → ใช้ขั้นตอนใน session 4 + `--force-recreate` ไม่ใช่ `restart`

### 🔑 docker compose restart ไม่โหลด .env ใหม่

> `docker compose restart` → container restart แต่ ENV VARS ยังเป็นของเดิม (ค่าตอน create)
> **ถ้าแก้ .env ต้องใช้:** `docker compose up -d --force-recreate`

### 🔑 Drive folder cache — อย่า restart บ่อย

> `driveService.js` cache folder IDs ใน RAM (`const folderCache = new Map()`)
> ถ้า token ยัง valid ตอน startup → cache folder → Drive upload ผ่านแม้ token expire ทีหลัง
> restart ล้าง cache → ทุก call ต้องใช้ token จริง → ถ้า token เสียจะพังทันที

### 🔑 Image vs File upload pattern

> รูปผ่าน `saveImageGroup()` (delay 5s) — ไฟล์ผ่าน `handleNonImageMessage()` (ทันที)
> ทั้งคู่ต้องมี try-catch แยก GCS / Drive เสมอ มิฉะนั้นถ้า GCS พัง Drive จะไม่รันด้วย

### 🔑 gcs-key.json

> ไม่อยู่ใน Docker image (excluded ใน .dockerignore)
> Production server mount เป็น volume เอง — อย่า panic ถ้าไม่เห็นใน repo
