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

### อัพเดท: 24 มิถุนายน 2569 (session 3)

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

### ✅ Session 4 — GCS confirmed + Drive token fix again (24 มิ.ย. 69)

**GCS — ยืนยันว่าทำงานได้แล้ว:**
- ทดสอบ `file.save()` และ `getSignedUrl()` ตรงๆ จาก container → ผ่านทั้งคู่
- `bucket.exists()` fails เป็น expected behavior (SA ไม่มี `storage.buckets.get`) แต่ upload/signed URL ทำงานได้
- Service account: `boonyarit-bot-storage@tax-ocr-498513.iam.gserviceaccount.com` มี permission เพียงพอสำหรับ object operations

**Drive token หมดซ้ำ — สาเหตุ:**
- token ที่สร้างในช่วงที่ app ยัง Testing mode ถูก Google invalidate เมื่อเปลี่ยนเป็น Production
- ต้องสร้าง refresh token ใหม่อีกครั้ง หลังจากเปลี่ยนเป็น Production แล้ว

**แก้แล้ว (Session 4):**
- รัน `node scripts/refresh-drive-token.js` → ได้ token ใหม่
- อัปเดตบน server ด้วย Python stdin (sed มีปัญหากับ `//` ใน token)
- อัปเดต Drive backup (file ใหม่สุดใน Boonyarit/ folder เสมอ)
- Restart container → ไม่มี error ใหม่

**คำสั่ง sed ที่ถูกต้องสำหรับ token ที่มี `//`:**
```bash
# ใช้ | เป็น delimiter แทน / เพื่อหลีกเลี่ยงปัญหา
sed -i 's|^GOOGLE_DRIVE_REFRESH_TOKEN=.*|GOOGLE_DRIVE_REFRESH_TOKEN=NEW_TOKEN|' /home/worker/lineoa-dev/.env
# หรือใช้ Python stdin ซึ่งปลอดภัยกว่าเสมอ
```

### ✅ Session 4 ต่อ — Root cause ชัดเจน + แก้ถาวร

**สาเหตุที่แท้จริงของ invalid_grant:**
- `driveService.js` ใช้ `'urn:ietf:wg:oauth:2.0:oob'` เป็น redirect_uri (deprecated โดย Google ตั้งแต่ 2022)
- **แก้แล้ว:** เปลี่ยนเป็น `'http://localhost:9999'` ให้ตรงกับ `refresh-drive-token.js`

**บทเรียนสำคัญ — `docker compose restart` vs `up --force-recreate`:**
- `docker compose restart` → restart container แต่ ENV VARS ไม่เปลี่ยน (ใช้ของเก่า)
- `docker compose up -d --force-recreate` → recreate container ใหม่ โหลด `.env` ใหม่ทั้งหมด
- **ถ้าต้องการให้ `.env` มีผล ต้องใช้ `--force-recreate` เสมอ**

**Drive folder cache in-memory:**
- `driveService.js` มี `const folderCache = new Map()` — cache folder IDs ใน RAM
- เมื่อ server start และ token valid → folder ID ถูก cache → ใช้งานได้แม้ token expire ทีหลัง
- เมื่อ restart container → cache หาย → ทุก call ต้องใช้ token จริง

**สถานะปัจจุบัน (24 มิ.ย. 69 ~19:30 ICT):**
- ✅ Drive token valid — อัปเดตด้วย `--force-recreate`
- ✅ GCS — ทำงานได้ (key mounted, permissions ถูกต้อง)
- ✅ driveService.js — แก้ redirect_uri แล้ว (รอ deploy)
- ✅ ไม่มี `invalid_grant` ใน log แล้ว

### 🟡 ถัดไป

1. **ทดสอบส่งรูปใน LINE** — เช็คว่าขึ้น Drive และ GCS จริงไหม
2. **ถ้าต้อง refresh token ใหม่ในอนาคต:**
   - `cd backend && node scripts/refresh-drive-token.js`
   - แล้วอัปเดต `/home/worker/lineoa-dev/.env` บน server
   - **ต้องใช้ `docker compose up -d --force-recreate`** ไม่ใช่ `restart`

### 🔑 Image vs File upload pattern

> รูปผ่าน `saveImageGroup()` (delay 5s) — ไฟล์ผ่าน `handleNonImageMessage()` (ทันที)
> ทั้งคู่ต้องมี try-catch แยก GCS / Drive เสมอ มิฉะนั้นถ้า GCS พัง Drive จะไม่รันด้วย

### 🔑 gcs-key.json

> ไม่อยู่ใน Docker image (excluded ใน .dockerignore)
> Production server mount เป็น volume เอง — อย่า panic ถ้าไม่เห็นใน repo
