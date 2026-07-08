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

// เปิด/ปิดฟีเจอร์ตรวจสอบการโอนเงิน (OCR) สำหรับกลุ่มหนึ่งๆ
export async function toggleGroupPaymentVerify(groupId, isPaymentVerifyGroup) {
  const res = await axiosInstance.patch(`/api/groups/${groupId}/payment-verify`, { isPaymentVerifyGroup })
  return res.data
}

export async function fetchPaymentVerifications({ groupId, status } = {}) {
  const res = await axiosInstance.get('/api/payment-verification', { params: { groupId, status } })
  return res.data
}

export async function fetchPaymentVerificationDetail(id) {
  const res = await axiosInstance.get(`/api/payment-verification/${id}`)
  return res.data
}

export async function correctPaymentVerification(id, updates) {
  const res = await axiosInstance.patch(`/api/payment-verification/${id}`, updates)
  return res.data
}
