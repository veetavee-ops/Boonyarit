// Link Preview — ดึง Open Graph meta (title/image/site) จาก URL มาโชว์เป็นการ์ดใต้ข้อความ
// เหมือนที่ LINE แอปจริงทำให้อัตโนมัติ — fetch ฝั่ง server เพราะ browser เจอ CORS ถ้าจะ fetch ตรงจาก
// frontend, cache ผลไว้ในหน่วยความจำกันดึงซ้ำ (URL เดิมมักถูกเรียกดูหลายครั้งเวลาเลื่อนแชท)
const express = require('express');
const router = express.Router();
const axios = require('axios');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

const cache = new Map(); // url -> { data, expiresAt }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function extractMeta(html, prop) {
  // meta tag เขียนสลับลำดับ attribute ได้ทั้ง 2 แบบ (property ก่อน content หรือกลับกัน)
  const re1 = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? m[1] : null;
}

function decodeEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// YouTube (ทุกรูปแบบ URL รวม /shorts/) บล็อกการ scrape og: tag ตรงๆ จาก IP เซิร์ฟเวอร์/dev เสมอ
// (ทดสอบแล้ว — หน้า HTML ที่ตอบกลับมาไม่มี og: tag เลยสักตัว เหมือนโดน bot-detection) ต้องใช้ endpoint
// oEmbed ทางการของ YouTube แทน (ไม่ต้อง API key, ไม่โดนบล็อก, คืน title/thumbnail/author ให้ตรงๆ)
function extractYoutubeVideoId(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)youtube\.com$/.test(u.hostname) && u.hostname !== 'youtu.be') return null;
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null;
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
    if (u.pathname === '/watch') return u.searchParams.get('v');
    return null;
  } catch {
    return null;
  }
}

async function fetchYoutubePreview(url) {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) return null;
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const response = await axios.get('https://www.youtube.com/oembed', {
    params: { url: canonicalUrl, format: 'json' },
    timeout: 6000,
  });
  return {
    url,
    title: response.data.title || null,
    description: null,
    image: response.data.thumbnail_url || null,
    siteName: response.data.provider_name || 'YouTube',
  };
}

async function fetchGenericPreview(url) {
  const response = await axios.get(url, {
    timeout: 6000,
    maxContentLength: 2 * 1024 * 1024,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BoonyaritLinkPreview/1.0)' },
    responseType: 'text',
    validateStatus: (s) => s < 500,
  });
  const html = String(response.data);
  const titleTagMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return {
    url,
    title: decodeEntities(extractMeta(html, 'og:title')) || decodeEntities(titleTagMatch?.[1]) || null,
    description: decodeEntities(extractMeta(html, 'og:description')),
    image: extractMeta(html, 'og:image'),
    siteName: decodeEntities(extractMeta(html, 'og:site_name')),
  };
}

router.get('/', async (req, res) => {
  const { url } = req.query;
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'url ไม่ถูกต้อง' });
  }

  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.data);
  }

  try {
    const data = (await fetchYoutubePreview(url)) || (await fetchGenericPreview(url));
    cache.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    res.json(data);
  } catch (error) {
    console.error('[ERROR] GET /api/link-preview:', error.message);
    // คืน 200 ค่าว่างแทน error — ลิงก์ยังกดเปิดได้ปกติ แค่ไม่มีการ์ด preview ให้แสดง (เช่นวิดีโอถูกลบ/ตั้งเป็นส่วนตัว)
    res.json({ url, title: null, description: null, image: null, siteName: null });
  }
});

module.exports = router;
