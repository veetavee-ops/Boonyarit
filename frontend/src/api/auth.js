import axios from 'axios'

// Get API base URL from environment variable or use default
const API_BASE = import.meta.env.VITE_API_URL || '';

const axiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 10000, // 10 seconds timeout
})

/**
 * Login with username and password
 */
export async function login(username, password) {
  try {
    const res = await axiosInstance.post('/api/auth/login', { username, password })
    if (res.data.token) {
      localStorage.setItem('token', res.data.token)
    }
    return res.data
  } catch (error) {
    console.error('Login error:', error)
    throw new Error(error.response?.data?.error || 'Login failed')
  }
}

/**
 * Logout and clear authentication token
 */
export async function logout() {
  try {
    localStorage.removeItem('token')
    await axiosInstance.post('/api/auth/logout')
  } catch (error) {
    console.error('Logout error:', error)
    // Still remove token even if API call fails
  }
}

/**
 * Update admin profile (lineUserId และ/หรือ email) — ส่งเฉพาะ field ที่มีค่า
 */
export async function updateProfile({ lineUserId, email } = {}) {
  const token = localStorage.getItem('token')
  const body = {}
  if (lineUserId !== undefined) body.lineUserId = lineUserId
  if (email !== undefined) body.email = email
  try {
    const res = await axiosInstance.patch('/api/auth/profile', body, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    return res.data
  } catch (error) {
    throw new Error(error.response?.data?.error || 'บันทึกไม่สำเร็จ')
  }
}

/**
 * เปลี่ยนรหัสผ่านตอน login อยู่แล้ว — ต้องส่งรหัสผ่านเดิมไปด้วยเพื่อยืนยันตัวตน
 */
export async function changePassword(currentPassword, newPassword) {
  // ดึง token ที่เก็บไว้ตอน login มาแนบไปกับ request (ให้ backend รู้ว่าเป็น user คนไหน)
  const token = localStorage.getItem('token')
  try {
    const res = await axiosInstance.post(
      '/api/auth/change-password',
      { currentPassword, newPassword },
      { headers: { 'Authorization': `Bearer ${token}` } }
    )
    return res.data
  } catch (error) {
    // ถ้า backend ส่ง error message กลับมา ให้โยน error นั้นออกไป ไม่งั้นโยนข้อความ default
    throw new Error(error.response?.data?.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ')
  }
}

/**
 * ขอลิงก์ "ลืมรหัสผ่าน" — ใช้ตอนยังไม่ได้ login (จำรหัสผ่านไม่ได้)
 * แค่กรอกอีเมล ระบบจะส่งลิงก์ไปให้ทางอีเมลนั้น
 */
export async function forgotPassword(email) {
  try {
    const res = await axiosInstance.post('/api/auth/forgot-password', { email })
    return res.data
  } catch (error) {
    throw new Error(error.response?.data?.error || 'ส่งคำขอไม่สำเร็จ')
  }
}

/**
 * ตั้งรหัสผ่านใหม่ โดยใช้ token ที่ได้จากลิงก์ในอีเมล (มาจาก forgotPassword ด้านบน)
 */
export async function resetPassword(resetToken, newPassword) {
  try {
    const res = await axiosInstance.post(`/api/auth/reset-password/${resetToken}`, { newPassword })
    return res.data
  } catch (error) {
    throw new Error(error.response?.data?.error || 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ')
  }
}

/**
 * Check if user is authenticated
 */
export async function checkAuth() {
  const token = localStorage.getItem('token')
  if (!token) {
    throw new Error('No authentication token')
  }

  try {
    const res = await axiosInstance.get('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    return res.data.admin
  } catch  {
    localStorage.removeItem('token')
    throw new Error('Authentication failed')
  }
}
