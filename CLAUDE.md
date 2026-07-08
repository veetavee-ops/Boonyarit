# LINE OA V2 — Claude Instructions

**อ่านไฟล์เหล่านี้ก่อนทำงานทุกครั้ง:**
1. `PROJECT_OVERVIEW.md` — โครงสร้างระบบ, models, routes, services, roadmap ครบทุกชั้น

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
- **ห้าม invoke `/claude-api` bundled skill เด็ดขาด** — skill นี้โหลด doc หลายพันบรรทัดทำให้ context เต็มทันที ถ้าผู้ใช้พูดถึงหรือข้อความขึ้นต้นด้วย `/claude-api` ให้ตอบเป็น text ธรรมดาเท่านั้น

---

## Session Status

### อัพเดท: 8 กรกฎาคม 2569 (session 11)

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

### ✅ Session 6 — Local Dev Setup + Skills + Cleanup Plan (26 มิ.ย. 69)

**Local Dev ครั้งแรก:**
- `node_modules` ไม่ติดมากับ repo → ต้อง `npm install` ก่อน (ครั้งแรกเท่านั้น)
- `backend/.env` ดึงจาก Drive ด้วย `/creds` → เขียนลง `backend/.env`
- `frontend/vite.config.js` — เพิ่ม proxy `/api` + `/socket.io` → `localhost:3000` (ไม่มีจะ 404 ทุก call)
- Admin account: `superadmin` / `kpp22312231` (reset จาก superuser)

**start.ps1 + .vscode/tasks.json:**
- `start.ps1` — แก้ใช้ `$root` แทน hardcode path + เช็ค nvm + เช็ค Node v24 + auto `npm install`
- `.vscode/tasks.json` — เปิด 3 terminal ใน VS Code (backend, frontend, ngrok) + เปิด browser อัตโนมัติ
- รัน dev: `Ctrl+Shift+B` → **Start Dev** (แนะนำ) หรือ `.\start.ps1` (เปิด window แยก)

**Skills ที่สร้างใหม่:**
- `~/.claude/commands/start.md` — global skill หา start script แล้วรัน (backup ใน Drive)
- `.claude/commands/start.md` — project skill เฉพาะ Boonyarit (ติด repo)
- `~/.claude/commands/gdrive-delete.md` — ลบไฟล์ Drive ด้วย OAuth token
- `~/.claude/scripts/gdrive-update.py` — เพิ่ม `--delete` flag
- `/creds` — แก้ให้ลบ `.env` ซ้ำอัตโนมัติหลัง load

**Inactive User Cleanup — วางแผนแล้ว:**
- ดู `PROJECT_OVERVIEW.md` หัวข้อ 14 — flow, edge cases, สิ่งที่ต้องสร้าง
- ยังไม่ implement — ถ้าต้อง ดู plan ก่อนเสมอ

### ✅ Session 7 — Inactive User Cleanup (26 มิ.ย. 69)

**ทดสอบลบไฟล์จากสารบัญ:** ✅ ผ่าน (Drive + GCS ลบได้จริง)  
**Backfill script:** ยกเลิก ไม่ทำ

**Implement `cleanupInactiveUsers()` ใน `cleanupService.js`:**
- วัน 173: query user inactive 172-173 วัน → ส่ง LINE push message เตือน 7 วัน
- วัน 180: query user inactive > 180 วัน → ลบ GCS files + ลบ messages
- ข้าม user ที่ `canSearch = true` (ตั้งใจใช้งานอยู่)
- ใช้ raw SQL `JOIN "Users"` เหมือน pattern ใน messages.js
- รันใน `startCleanupCron()` ทุกรอบ (ตี 2 ทุกวัน)

### ✅ Session 8 — วิเคราะห์ cleanupExpiredMessages + GCS URL pattern (27 มิ.ย. 69)

**ไม่มี code change — เป็น session วิเคราะห์:**

**cleanupExpiredMessages — ปัญหาที่พบ:**
- บรรทัด `await msg.destroy()` ลบ message record ทั้งหมดออกจาก DB อันตราย
- ควรเก็บ message ไว้ (ประวัติแชท) แค่ล้าง gcsUrl ออกจาก metadata

**GCS URL ที่เก็บใน DB:**
- DB เก็บ `gcsUrl` (signed URL เต็มๆ) + `gcsPath` + `gcsUrlExpires: '2099-12-31'`
- Frontend มี fallback: `gcsUrl || mediaUrl(gcsPath)` → `/api/media?path=` → generate URL ใหม่
- ฉะนั้น `gcsUrl` ใน DB เป็น cache เท่านั้น — `gcsPath` คือสิ่งสำคัญจริงๆ

**Pattern ที่ดีกว่า (Pattern 2 — implement แล้ว session 9):**
- เลิกเก็บ `gcsUrl`/`gcsUrls`/`gcsUrlExpires` ใน DB เลย
- เก็บแค่ `gcsPath` → `/api/media` generate URL on-demand (มี cache 50 นาทีอยู่แล้ว)
- ลบ `cleanupExpiredMessages` ออกจาก cleanupService แล้ว

### ✅ Session 9 — Pattern 2 migration + login fix (28 มิ.ย. 69)

**Pattern 2 — เลิกเก็บ gcsUrl ใน DB:**
- `webhook.js`: ลบ `getSignedUrlLong` import + ลบ `gcsUrls`/`gcsUrl`/`gcsUrlExpires` ออกจากทุก case (image/video/audio/file) เก็บแค่ `gcsPath`/`gcsPaths`
- `cleanupService.js`: ลบ `cleanupExpiredMessages()` ออกทั้งฟังก์ชัน + ลบ `Op` require
- `MessageBubble.jsx`: ลบ `gcsUrl`/`gcsUrls` fallback ออก ใช้ `mediaUrl(gcsPath)` ตรงๆ
- DM reply link (webhook.js line ~127): ใช้ driveFileId ก่อน → fallback `${BASE_URL}/api/media?path=...`
- ข้อมูลเก่าที่มี `gcsUrl` ใน DB → ยังแสดงได้ปกติเพราะ `gcsPath` มีคู่กันเสมอ

**Bug fix — login fail ทุก fresh start:**
- Root cause: `{ alter: true }` ใน dev → ALTER TABLE ทุก table ทุก restart → ใช้เวลา 5-10+ วินาที
- `server.listen()` ถูกเรียกหลัง sync เสร็จ แต่ browser เปิดหลัง 3 วินาที (tasks.json) → race condition → Vite proxy return 500
- Fix: `server.js` เปลี่ยน `syncOptions = process.env.NODE_ENV === 'production' ? {} : { alter: true }` → `syncOptions = {}`
- ผล: server start < 1 วินาที ไม่มี race condition อีกต่อไป

**Known bug (ไม่แก้ — production ไม่มีปัญหา):**
- หลัง login ครั้งแรก panel กลุ่มขวา "ยังไม่มีกลุ่ม" → ต้องเข้า admin-panel แล้วกลับมา → groups ขึ้นปกติ
- เป็น React state issue ใน local dev เท่านั้น production ไม่กระทบ

### ✅ Session 10 — Skills management + Drive cleanup (28 มิ.ย. 69)

**Skills ที่แก้/สร้างใหม่:**
- แก้ typo `mem.md` + `feedback_mem_skill_steps.md`: `/duskill` → `/udskill`
- เพิ่ม rule ห้าม invoke `/claude-api` ทั้งใน global CLAUDE.md และ project CLAUDE.md
- เพิ่ม Google Drive Folder IDs ใน global CLAUDE.md: MY DEV CREDENTIALS root, Skills folder, _claude-config
- Rename `/kpppuse` → `/kpplink` + เพิ่ม links Drive root/Skills/config/global-claude.md
- สร้าง `/aiflow` — อธิบาย flow การโหลด context ของ Claude ทุก session (3 ระยะ)
- Rename `helpskill` → `22312231skill` — เพิ่มตารางเลข 1-13 + loop (แสดงตาราง → รัน skill → แสดงซ้ำ จนกว่า user พิมพ์ `.`)
- สร้าง `/skillfetch` — เปรียบเทียบ skills local vs Drive + sync upload ที่ขาด
- Backup global CLAUDE.md ขึ้น Drive: file ID `1JDi27fgP43KwBKNipvAnUofDwBTWlagi` ใน `_claude-config`

**Drive cleanup:**
- ลบ duplicate ใน `_claude-skills` folder: mem.md/popup.md/helpskill.md แต่ละตัวมี 2 copies → เหลือ 1
- สแกน Drive root ทั้งหมด พบ:
  - `tax-ocr/`: CLAUDE.md x5 (keep `1BUdruo8...` session 19, 31923 bytes), `.env` x3 (keep `1e2288av...` มี OPENAI_API_KEY) — **รอ user confirm**
  - root level: `gdrive.md`, `start.md` อยู่ผิดที่ ควรอยู่ใน `_claude-skills` — **รอ user confirm**
- `mydev_CorePlan_Erp/` ใน Drive: มีแค่ `memory/` folder (10+ project memory files จาก session พ.ค. 69) ไม่มี CLAUDE.md หรือ .env — เพราะ `/udskill`/`/addcreds` ยังไม่มีตอนนั้น

### ✅ Session 11 — PersonalVault: personal asset portfolio tracker (28 มิ.ย.–8 ก.ค. 69)

**⚠️ สำคัญ: โปรเจกต์นี้อยู่คนละที่ ไม่ใช่ repo/DB เดียวกับ Boonyarit**
- Path: `D:\_888_230626_Dev Project\PersonalVault\backend\` — repo/package.json/process แยกต่างหากจริงๆ ไม่ใช่ folder ย่อยใน Boonyarit
- Session Claude ที่เปิดใน Boonyarit จะไม่เห็นโค้ดนี้อัตโนมัติ ต้องเปิด working dir ที่ PersonalVault เอง (หรือบอก Claude ว่าให้ไปดูที่นั่น)

**ที่มา (ตัดสินใจหลังคุยหลายรอบ):**
- เริ่มจากอยากได้ตาราง "กระแสเงินสด" → ขยายเป็น portfolio ทรัพย์สินทั้งหมด (เงิน/ที่ดิน/ทองอื่นๆ) → คิดจะฝากไว้ใน DB เดียวกับ Boonyarit แต่แยก schema → สุดท้ายตัดสินใจแยกเป็น **standalone app คนละ repo/process จริง** เพราะกลัวเรื่อง reliability/blast radius (ถ้าโค้ดส่วนตัวพังไม่อยากให้กระทบบอท LINE ที่ลูกค้าใช้จริง) ไม่ใช่เรื่องความเร็ว
- เคยคิดจะทำ password manager ในตัวด้วย — **ตัดออกแล้ว** ให้ใช้ Bitwarden/KeePass แทน (เก็บรหัสผ่านเองเสี่ยงเกินไป)
- ลิงก์/bookmark เว็บที่ใช้บ่อย — ยังไม่ทำ (deferred ไปหลัง Phase 1 asset portfolio)

**สถาปัตยกรรมที่ใช้:**
- Node/Express แยก process จาก Boonyarit แต่วางแผนรันบน droplet เดียวกัน (คนละ port เช่น 3001, Caddy ชี้ path/subdomain ใหม่ไป) — ยังไม่ deploy จริง ตอนนี้รันแค่ local
- ต่อ Postgres (Neon) **instance เดียวกับ Boonyarit** แต่คนละ schema (`personal_portfolio`) — ใช้ `DATABASE_URL` ตัวเดียวกับใน Boonyarit `.env`
- Auth แบบ single-user ง่ายๆ (password เดียว + JWT cookie) ไม่มี Admin/role table แบบ Boonyarit
- Data model: `Asset` (base + JSONB `attributes` ตาม type) + `AssetTransaction` (รายรับ/จ่าย) + `AssetValuation` (ประวัติมูลค่า — net worth คำนวณจาก valuation ล่าสุด ไม่ใช่ field เดียวที่ทับ)
- Validate JSONB attributes ด้วย Zod ตาม asset type (land/bank_account/gold/stock/vehicle/liability/other)

**Phase 1 เสร็จแล้ว + ทดสอบผ่าน (login → CRUD → net worth summary):**
- `models/`: Asset.js, AssetTransaction.js, AssetValuation.js, index.js
- `validators/assetSchemas.js`, `services/portfolioService.js`, `routes/{auth,portfolio}.js`
- `scripts/hash-password.js` — รันเองเพื่อสร้าง `OWNER_PASSWORD_HASH` ใส่ `.env` (ตอนนี้ยังว่าง ต้องตั้งเอง)

**Gotcha ที่เจอระหว่าง implement:**
- **dotenv ต้องโหลดบนสุดของ entry point** — เดิมโหลดใน `config/database.js` เท่านั้น แต่ `middleware/auth.js` เช็ค `process.env.JWT_SECRET` ตอน require (ก่อน dotenv โหลด) ทำให้ crash ทันที ต้องมี `require('dotenv').config()` เป็นบรรทัดแรกของ `server.js`
- **Sequelize + custom timestamp column ไม่ translate ใน order array** — model ตั้ง `createdAt: 'created_at'` (rename column) แต่ `order: [['createdAt','DESC']]` ไม่แปลงเป็น `created_at` ให้ ทำให้ query error `column ... createdAt does not exist` ต้องใช้ชื่อ column จริง (`'created_at'`) ตรงๆ ใน order array แทน
- **ทดสอบด้วยข้อความไทยผ่าน bash inline command ไม่น่าเชื่อถือ** — เจอ mojibake ตอน curl -d ด้วย string ไทยตรงๆ ใน command แต่พอเขียนเป็นไฟล์ JSON แล้ว curl --data-binary @file กลับได้ข้อมูลถูกต้อง (encoding เพี้ยนที่ชั้น shell ไม่ใช่ bug ของแอป) — เวลาทดสอบข้อมูลภาษาไทยครั้งหน้าให้ใช้ไฟล์เสมอ อย่า inline ใน bash string

### ✅ Session 12 — Merge งานค้าง + ฟีเจอร์ตรวจสอบการโอนเงิน (OCR) + PersonalVault setup (8 ก.ค. 69)

**⚠️ สถานะ ณ ตอนจบ session — ยังไม่ commit/push งานใหญ่ 2 ก้อน ต้องทำต่อ session หน้า:**
1. **ยังไม่ push ขึ้น origin** — local นำหน้าอยู่ 4 commits (merge commit `9c07634` + Pattern 2 migration + docs เก่า)
2. **มีงานค้างไม่ commit อีกก้อนใหญ่** (10 ไฟล์ — ดูรายละเอียดด้านล่าง "ฟีเจอร์ตรวจสอบการโอนเงิน")

**Merge งานจากเครื่องอื่น:**
- Commit Pattern 2 migration ที่ค้างมาตั้งแต่ session 9 (ไม่เคย commit จริง) + merge commits จากเครื่องอื่น (retheme, ระบบรหัสผ่าน, sidebar redesign, คำสั่ง "สรุปเลย") — merge ผ่านอัตโนมัติเกือบหมด conflict แค่ CLAUDE.md (เก็บทั้ง 2 ฝั่งไว้)
- ดึง `gcs-key.json` จริงจาก production มาใส่ local — แก้ปัญหารูปไม่ขึ้นหลัง Pattern 2 migration (ตอนนี้ local dev ต้องมี key นี้ถึงจะเห็นรูป เพราะไม่มี URL สำรองใน DB แล้ว)
- เจอ + แก้ปัญหา process ค้าง/port ชนหลายรอบระหว่างทดสอบ (ของ Claude เองไปชนกับ dev server ของ user) — บทเรียน: **เช็ค port ว่างก่อนรัน dev server ทดสอบเองทุกครั้ง**

**เพิ่มหมายเหตุใน bot reply (คำสั่งค้นหา/สรุป):**
- `webhook.js` — เพิ่ม `BOT_COMMAND_NOTICE` แปะท้าย reply ทุกกรณีของคำสั่งค้นหา/สรุป (8 จุด) แจ้งผู้ใช้ว่าคำสั่ง+คำตอบนี้จะไม่ถูกบันทึกในคลังแชท (กันเข้าใจผิดว่าข้อความหาย — root cause ของเคส "ข้อความสรุปเลยหายไป" ที่ไล่เจอใน session นี้)

**🆕 ฟีเจอร์ตรวจสอบการโอน-จ่ายเงิน (OCR) — สร้างเสร็จ ทดสอบ logic/DB/API ผ่านแล้ว แต่ยังไม่ commit:**
- แนวคิด: เจ้าหน้าที่ส่งรูป 2 ใบติดกัน (รายงานตั้งเบิกจาก ERP ภายใน + สกรีนช็อตธนาคาร เช่น K BIZ) เข้ากลุ่ม LINE ที่ติดธงไว้เฉพาะ → AI vision อ่านทั้ง 2 รูป จับคู่ยอด → ตอบกลับใน LINE ทันที + เก็บ ledger ไว้ดูย้อนหลังใน Dashboard
- **ตัดสินใจสถาปัตยกรรมสำคัญ**: ไม่เชื่อม CorePlan ERP database ตรง (ใช้ OCR รูปแทน) + เก็บ ledger ใน **schema แยก `payment_verification`** (Postgres instance เดียวกับ Boonyarit แต่คนละ schema จาก `public` — เหมือน pattern PersonalVault) + จำกัดสิทธิ์ดู Dashboard เฉพาะ role `superuser` เท่านั้น (staff ที่มีสิทธิ์เห็นกลุ่มปกติผ่าน AdminGroup ไม่เห็นหน้านี้)
- ไฟล์ใหม่: `backend/models/PaymentVerification.js`, `backend/routes/paymentVerification.js`, `frontend/src/api/paymentVerification.js`, `frontend/src/pages/PaymentVerificationPage.{jsx,css}`
- ไฟล์แก้: `Group.js` (+`isPaymentVerifyGroup`), `models/index.js`, `routes/groups.js` (+toggle endpoint), `routes/webhook.js` (routing + buffer 2 รูป), `services/aiService.js` (+vision extraction + matching), `server.js` (+create schema), `App.jsx`/`Sidebar.jsx`/`AdminPanel.jsx` (UI)
- **บั๊กที่เจอ+แก้ระหว่างทดสอบจริง (สำคัญ อย่าลืม):**
  1. Matching logic เดิมเทียบแค่รายการเงินออก — พลาดรายการที่เป็นเงินเข้า (เช่น "ขอยืมผู้การ") ที่อยู่ในตารางตั้งเบิกเหมือนกัน แก้ให้เทียบทุกทิศทาง
  2. Sequelize สร้าง FK constraint ข้าม schema ผิด (`PaymentVerification.belongsTo(Group, ...)` พอ Group อยู่คนละ schema ทำให้ auto-FK อ้าง schema ผิด) — แก้ด้วย `constraints: false` ใน association
  3. `sync({})` ไม่ ALTER ตาราง `Groups` เดิมให้มีคอลัมน์ใหม่ — ต้องรัน `ALTER TABLE "Groups" ADD COLUMN ...` มือ (รันไปแล้วบน DB จริงที่ Boonyarit ใช้ร่วมกับ production — **DB มีคอลัมน์ใหม่แล้วแม้โค้ดยังไม่ push**)
- ทดสอบแล้ว: matching logic (ข้อมูลจริงจากรูปที่ user ส่งมา, 6/6 ตรง), AI vision pipeline (Gemini fail → fallback Groq สำเร็จ), DB CRUD ข้าม schema, API login+auth+toggle ผ่าน HTTP จริง, frontend build ผ่าน
- **ยังไม่ทดสอบ**: ส่งรูปจริงผ่าน LINE เข้ากลุ่มที่ติดธงจริง (ต้องเปิดธงกลุ่มทดสอบก่อนแล้วลองส่งจริง)

**⚠️ Gemini API key โควต้า = 0 (ไม่ใช่ใช้หมด แต่ไม่เคยได้ free tier เลย):**
- ทดสอบแล้วพบว่า Google Cloud project ที่สร้าง key นี้ไม่มี free tier quota เลยสักนิด (`limit: 0` ทั้ง input token / request ต่อนาที / ต่อวัน) — ไม่เกี่ยวกับปริมาณการใช้งาน
- สาเหตุที่พบบ่อย: ต้องผูก billing account เข้า Google Cloud project ก่อนถึงจะปลดล็อก free tier (Google เปลี่ยนนโยบาย) — ต้องเข้า https://aistudio.google.com/apikey เช็คว่า project ไหนสร้าง key นี้แล้วผูก billing
- ไม่กระทบการใช้งานตอนนี้เพราะ fallback ไป Groq ทำงานได้สมบูรณ์ (ทั้งฟีเจอร์สรุปแชทเดิม + ตรวจสอบเงินใหม่) แต่ถ้า Groq มีปัญหาจะไม่มีตัวสำรอง

### ✅ PersonalVault อัปเดต (8 ก.ค. 69, session 12)

- **Git repo สร้างแล้ว + push ขึ้น GitHub แล้ว**: `github.com/veetavee-ops/PersonalVault` branch `main` (commit `b46a110` Phase 1 + `d32ecd9` เพิ่ม CLAUDE.md ของตัวเอง) — ก่อนหน้านี้ไม่มี git repo เลย เสี่ยงงานหายมาตลอด แก้แล้ว
- **`OWNER_PASSWORD_HASH` ตั้งค่าจริงแล้ว** ทดสอบ login ผ่าน (`kpp2231`)
- **สร้าง `PersonalVault/backend/CLAUDE.md` ของตัวเอง** — บันทึกสถาปัตยกรรม + ขอบเขตที่ตกลงกันไว้ (ห้ามรวม repo กับ Boonyarit, ห้ามทำ password manager, ห้ามสร้าง LINE bot แยก, ห้าม multi-user) กัน session ในอนาคตที่เปิดตรง PersonalVault โดยตรงหลงแผน — **อ่านไฟล์นั้นก่อนแตะ PersonalVault เสมอ**
- ⚠️ พบว่า DB password (Neon) เคยหลุดโชว์ใน terminal ระหว่าง debug ช่วงแรกๆ — ยังไม่ได้ rotate

### 🟡 ถัดไป (PersonalVault)

1. Phase 2: จุดเชื่อม LINE — เพิ่ม owner-check + forward HTTP call สั้นๆ ใน Boonyarit's `webhook.js` ไปที่ PersonalVault (ยังไม่แตะ `webhook.js` เลยตอนนี้) — คุยกันแล้วว่า Boonyarit ควร OCR ให้เสร็จก่อนแล้วส่งข้อมูลที่แกะแล้ว (ไม่ใช่รูปดิบ) ไปให้ PSV บันทึก แต่ยังไม่ได้ตกลง syntax คำสั่งและ auth ระหว่าง service
2. ตาราง Link/Bookmark (ลิงก์เว็บที่ใช้บ่อย) — ยังไม่ออกแบบ
3. Dashboard frontend — ยังไม่เริ่ม
4. Deploy จริงบน droplet (คนละ port + Caddy path ใหม่) — ตอนนี้รันแค่ local
5. Rotate Neon DB password (ดู gotcha ด้านบน)

### 🟡 ถัดไป

1. **🔴 commit งานฟีเจอร์ตรวจสอบการโอนเงิน (OCR) ที่ค้างอยู่ใน working tree** — 10 ไฟล์ (ดูรายละเอียด session 12) ยังไม่ commit เลย ก่อน commit ให้เช็คว่าอยากแยกเป็นหลาย commit ไหม (BOT_COMMAND_NOTICE เป็นคนละเรื่องกับฟีเจอร์ OCR ปนอยู่ใน `webhook.js` ไฟล์เดียวกัน)
2. **🔴 push ขึ้น origin** — local นำหน้าอยู่ 4 commits ยังไม่ขึ้น GitHub เลย (รวม Pattern 2 migration ที่ค้างมาตั้งแต่ session 9)
3. **ทดสอบฟีเจอร์ตรวจสอบการโอนเงินกับรูปจริงผ่าน LINE** — เปิดธง `isPaymentVerifyGroup` ให้กลุ่มทดสอบก่อน แล้วลองส่ง 2 รูปจริง (ยังทดสอบแค่ logic/DB/API ผ่าน HTTP เท่านั้น ยังไม่เคยทดสอบผ่าน LINE จริง)
4. **แก้ Gemini API billing** — เข้า https://aistudio.google.com/apikey เช็ค project ที่สร้าง key แล้วผูก billing account ให้ปลดล็อก free tier (ตอนนี้ระบบพึ่ง Groq เป็นหลักอย่างเดียว)
5. **SMTP สำหรับฟีเจอร์ลืมรหัสผ่าน** — ยังไม่ได้ตั้งค่า รอ Gmail + App Password จากคุณ (พักไว้ตั้งแต่ต้น session ยังไม่กลับมาทำ)
6. **tax-ocr Drive cleanup** — ลบ CLAUDE.md 4 อัน (keep `1BUdruo8dnxxXibPUNCegEoJiraxujWAo`) + ลบ .env 2 อัน (keep `1e2288av9H0RRX2yjgMyhxXCIIfAWGDha`) รอ user confirm
7. **root misplaced files** — `gdrive.md` + `start.md` ในรากของ Drive ควรย้ายเข้า `_claude-skills` หรือปล่อยไว้ รอ user confirm
8. **ถ้าต้อง refresh token ในอนาคต** → ใช้ขั้นตอนใน session 4 + `--force-recreate` ไม่ใช่ `restart`

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

### 🔑 ห้ามใส่ `alter: true` กลับ

> `sequelize.sync({ alter: true })` ใน dev → ALTER TABLE ทุก table ทุก restart → ช้า 5-10+ วินาที → login fail เพราะ race condition กับ browser auto-open (3 วินาที)
> **กฎ**: ใช้ `syncOptions = {}` เสมอ ถ้าต้องแก้ schema → รัน SQL migration เองแล้วแก้ model ให้ตรงกัน

### 🔑 Bash tool ของ Claude รันคนละ terminal กับที่ user เห็น

> Claude Code รันคำสั่งผ่าน Bash tool ใน shell session ของตัวเอง **ไม่ใช่** terminal
> เดียวกับที่ user เปิดอยู่ใน VS Code (backend/frontend/ngrok จาก `start.ps1`) —
> เป็นคนละ process กันเลย ต่อให้ Claude สั่ง `npm run dev` เอง user ก็จะไม่เห็นเลย
> จนกว่าจะมีปัญหาโผล่มา (เช่น port ชน EADDRINUSE ตอน Claude เผลอรัน backend
> เองซ้อนกับ nodemon ที่ user รันอยู่แล้ว)
>
> **ห้าม** รัน dev server (`npm run dev`, nodemon, vite) เองแบบ background ซ้อนกับ
> ของ user ที่รันอยู่แล้ว — ให้บอกคำสั่งเป็นข้อความแทน แล้วให้ user ไปรันเองใน
> terminal ที่เห็น จะได้เห็นตรงกันและไม่ชน port กัน
>
> ข้อยกเว้น: ใช้ Bash รัน dev server เองได้เฉพาะตอนต้องทดสอบ backend ชั่วคราว
> ผ่าน curl (เช่น debug API ตรงๆ) และต้อง**ปิดทิ้งทันที**หลังทดสอบเสร็จ ไม่ปล่อยค้าง

### 🔑 Sequelize model ข้าม schema ห้ามใช้ association ปกติ

> ถ้า model ใหม่ตั้ง `schema: 'xxx'` แยกจาก `public` แต่ต้อง `belongsTo`/`hasMany`
> กับ model ใน schema อื่น (เช่น `PaymentVerification` → `Group`) **ต้องใส่
> `constraints: false`** ใน association เสมอ ไม่งั้น Sequelize sync() จะสร้าง
> FK constraint ที่ qualify schemaผิด (อ้าง schema ของตัวเองแทนที่จะเป็น schema
> ของตารางปลายทาง) ทำให้ `CREATE TABLE` fail ทั้งก้อน — join ตอน query ยังทำงาน
> ปกติแม้ปิด constraint (แค่ไม่มี FK บังคับระดับ DB เท่านั้น)
