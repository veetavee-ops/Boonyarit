import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || '';

const axiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// เปิด/ปิดฟีเจอร์สรุปบิลซื้อของ (OCR) สำหรับกลุ่มหนึ่งๆ
export async function toggleGroupReceiptSummary(groupId, isReceiptSummaryGroup) {
  const res = await axiosInstance.patch(`/api/groups/${groupId}/receipt-summary`, { isReceiptSummaryGroup })
  return res.data
}
