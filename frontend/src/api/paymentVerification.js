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

// สรุปยอดคงเหลือ+รวมรายรับ-รายจ่ายต่อบัญชี (1 กลุ่ม LINE ที่ติดธง = 1 บัญชี)
export async function fetchLedgerAccounts() {
  const res = await axiosInstance.get('/api/payment-verification/accounts')
  return res.data
}

// รายการ ledger ของบัญชีเดียว เรียงใหม่→เก่า, cursor pagination ด้วย before
export async function fetchAccountLedger(groupId, { limit, before } = {}) {
  const res = await axiosInstance.get('/api/payment-verification/ledger', { params: { groupId, limit, before } })
  return res.data
}
