/**
 * refresh-drive-token.js
 * รัน: node scripts/refresh-drive-token.js
 * เปิด browser → Allow → รับ refresh token อัตโนมัติ (Node 16+)
 */
const http = require('http');
const https = require('https');
const querystring = require('querystring');

const CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ ต้องตั้ง GOOGLE_DRIVE_CLIENT_ID และ GOOGLE_DRIVE_CLIENT_SECRET ก่อน');
    process.exit(1);
}

const PORT = 9999;
const REDIRECT_URI = `http://localhost:${PORT}`;

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + querystring.stringify({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive',
    access_type: 'offline',
    prompt: 'consent',
});

console.log('\n=== Google Drive Re-Authorization ===\n');
console.log('เปิด URL นี้ใน browser:\n');
console.log(authUrl);
console.log('\nรอรับ code...\n');

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, REDIRECT_URI);
    const code = url.searchParams.get('code');

    if (!code) {
        res.end('No code');
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>✅ สำเร็จ! ปิดหน้าต่างนี้ได้เลย</h1>');
    server.close();

    const postData = querystring.stringify({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
    });

    const options = {
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
        },
    };

    const tokenReq = https.request(options, (tokenRes) => {
        let data = '';
        tokenRes.on('data', (chunk) => data += chunk);
        tokenRes.on('end', () => {
            const tokens = JSON.parse(data);
            if (!tokens.refresh_token) {
                console.log('⚠️  ไม่ได้ refresh_token — ลองรันใหม่อีกครั้ง');
            } else {
                console.log('\n✅ Refresh token ใหม่:\n');
                console.log(tokens.refresh_token);
                console.log('\n--- อัปเดตบน server ---');
                console.log('ssh root@168.144.137.42');
                console.log(`sed -i 's/^GOOGLE_DRIVE_REFRESH_TOKEN=.*/GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}/' /home/worker/lineoa-dev/.env`);
                console.log('docker compose -f /home/worker/lineoa-dev/docker-compose.yml restart');
            }
        });
    });

    tokenReq.on('error', (e) => console.error('❌ Error:', e.message));
    tokenReq.write(postData);
    tokenReq.end();
});

server.listen(PORT, () => {
    console.log(`รอรับ code ที่ port ${PORT}...`);
});
