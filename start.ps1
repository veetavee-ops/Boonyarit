# เปิด terminal ใหม่สำหรับ Backend โดยตั้ง working directory ตรงๆ ไม่ต้อง cd
Start-Process powershell -ArgumentList '-NoExit', '-Command', 'npm run dev' -WorkingDirectory 'e:\888-DEV PROJECT\BOONYARIT\backend'

# รอ 3 วินาที ให้ backend เริ่มก่อน
Start-Sleep -Seconds 3

# เปิด terminal ใหม่สำหรับ Frontend โดยตั้ง working directory ตรงๆ
Start-Process powershell -ArgumentList '-NoExit', '-Command', 'npm run dev' -WorkingDirectory 'e:\888-DEV PROJECT\BOONYARIT\frontend'

# รอ 2 วินาที ให้ frontend เริ่มก่อน
Start-Sleep -Seconds 2

# เปิด terminal ใหม่สำหรับ ngrok โดยตั้ง working directory ตรงๆ
Start-Process powershell -ArgumentList '-NoExit', '-Command', 'npm run ngrok' -WorkingDirectory 'e:\888-DEV PROJECT\BOONYARIT\backend'

# แจ้งว่าเปิดครบแล้ว
Write-Host "Done! Backend:3000 | Frontend:5173 | ngrok ready" -ForegroundColor Green
