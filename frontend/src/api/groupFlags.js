// groupFlags.js — เปิด/ปิด "ธง" ต่อกลุ่ม (รวมทุกฟีเจอร์แบบ per-group toggle ไว้ endpoint เดียว)
// field ที่ส่งไปต้องตรงกับ whitelist ฝั่ง backend (ALLOWED_GROUP_FLAG_FIELDS ใน routes/groups.js)
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

export async function toggleGroupFlag(groupId, field, value) {
  const res = await axiosInstance.patch(`/api/groups/${groupId}/flags`, { field, value });
  return res.data;
}
