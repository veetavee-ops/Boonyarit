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

### อัพเดท: 24 มิถุนายน 2569 (session 1)

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

### 🟡 ถัดไป

1. **ทดสอบรูปภาพ** — ส่งรูปใน LINE → ตรวจ Drive folder `Boonyarit_bot/`
2. **GCS** — ยังไม่มี `gcs-key.json` บน server → รูปจะ fallback ไป Drive อย่างเดียว
3. **Drive Backup ครบแล้ว**: Boonyarit ✅ / mydev_CorePlan_Erp ✅ / tax-ocr ✅

### 🔑 Image vs File upload pattern

> รูปผ่าน `saveImageGroup()` (delay 5s) — ไฟล์ผ่าน `handleNonImageMessage()` (ทันที)
> ทั้งคู่ต้องมี try-catch แยก GCS / Drive เสมอ มิฉะนั้นถ้า GCS พัง Drive จะไม่รันด้วย

### 🔑 gcs-key.json

> ไม่อยู่ใน Docker image (excluded ใน .dockerignore)
> Production server mount เป็น volume เอง — อย่า panic ถ้าไม่เห็นใน repo
