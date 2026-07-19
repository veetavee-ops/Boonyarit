// ledgerBalance.js — เรียก API อ่านข้อมูลฟีเจอร์ "เช็คยอดสมุดบัญชี" (ยืม-คืนเงิน)
// ตอนนี้ใช้แค่ดึงรายชื่อกลุ่มที่เปิดธงไว้ สำหรับ dropdown เลือกกลุ่มตอนทดสอบ OCR ใน AI ผู้ช่วย
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || ''

const axiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/**
 * ดึงรายชื่อกลุ่ม/บริษัทที่เปิดธง isLedgerBalanceGroup พร้อมยอดคงเหลือปัจจุบัน
 */
export async function fetchLedgerBalanceAccounts() {
  const res = await axiosInstance.get('/api/ledger-balance/accounts')
  return res.data
}
