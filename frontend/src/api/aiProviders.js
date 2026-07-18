// aiProviders.js — ฟังก์ชันติดต่อ backend สำหรับจัดการ AI provider ที่ user เพิ่มเอง
// ใช้แพทเทิร์นเดียวกับ labels.js (axiosInstance แยกของตัวเอง + token จาก localStorage)
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';

const axiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ดึง AI provider ที่เพิ่มเองทั้งหมด (apiKey ถูก mask มาจาก backend แล้ว)
export const fetchAiProviders = () =>
  axiosInstance.get('/api/ai-providers').then((r) => r.data);

// เพิ่ม provider ใหม่ — { name, baseUrl, apiKey, model }
export const createAiProvider = (data) =>
  axiosInstance.post('/api/ai-providers', data).then((r) => r.data);

// แก้ไข provider เดิม — { name, baseUrl, apiKey?, model } — apiKey เว้นว่างไว้ = ไม่เปลี่ยน
export const updateAiProvider = (id, data) =>
  axiosInstance.put(`/api/ai-providers/${id}`, data).then((r) => r.data);

// ลบ provider ตาม id
export const deleteAiProvider = (id) =>
  axiosInstance.delete(`/api/ai-providers/${id}`).then((r) => r.data);

// จัดลำดับความสำคัญ (สลับตำแหน่งตรงๆ กับตัวที่ถือเลขนั้นอยู่เดิม) — คืนรายการทั้งหมดที่อัปเดตแล้ว
export const updateProviderPriority = (id, priority) =>
  axiosInstance.patch(`/api/ai-providers/${id}/priority`, { priority }).then((r) => r.data);

// ทดสอบการเชื่อมต่อ — ส่ง { id } เพื่อทดสอบ provider ที่บันทึกแล้ว หรือ { baseUrl, apiKey, model }
// เพื่อทดสอบค่าที่ยังไม่บันทึก (ใช้ตอนกรอกฟอร์มอยู่) คืนค่า { ok, reply } หรือ { ok: false, error }
export const testAiProvider = (data) =>
  axiosInstance.post('/api/ai-providers/test', data).then((r) => r.data);
