import axios from 'axios'

// Get API base URL from environment variable or use default
const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Axios instance with authentication interceptor
 */
const axiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 30000, // 30 seconds timeout
})

// Add authentication token to requests
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle response errors
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
    }
    return Promise.reject(error)
  }
)

/**
 * Fetch all groups (private chats and group chats) — no date filter
 */
export async function fetchGroups() {
  try {
    const res = await axiosInstance.get('/api/groups')
    return res.data
  } catch (error) {
    console.error('Error fetching groups:', error)
    throw new Error(error.response?.data?.error || 'Failed to fetch groups')
  }
}

/**
 * Fetch list of dates that have messages within the given range
 * rangeValue: number, rangeUnit: 'day' | 'month' | 'year'
 */
export async function fetchAvailableDates(rangeValue = 7, rangeUnit = 'day') {
  try {
    const res = await axiosInstance.get('/api/dates', {
      params: { rangeValue, rangeUnit }
    })
    return res.data
  } catch (error) {
    console.error('Error fetching dates:', error)
    return []
  }
}

/**
 * Fetch messages for a specific group with optional pagination
 * sinceDays: จำกัดให้โหลดแค่ N วันย้อนหลัง (ไม่ใส่ = โหลดทั้งหมดแบบเดิม)
 */
export async function fetchMessages({ groupId, limit, before, sinceDays } = {}) {
  try {
    const params = {}
    if (groupId) params.groupId = groupId
    if (limit) params.limit = limit
    if (before) params.before = before
    if (sinceDays) params.sinceDays = sinceDays

    const res = await axiosInstance.get('/api/messages', { params })
    return res.data
  } catch (error) {
    console.error('Error fetching messages:', error)
    throw new Error(error.response?.data?.error || 'Failed to fetch messages')
  }
}

/**
 * ลบข้อความถาวร — ส่งได้ทั้งอันเดียว (array 1 ตัว) หรือหลายอันพร้อมกัน
 */
export async function deleteMessages(messageIds) {
  try {
    const res = await axiosInstance.delete('/api/messages', { data: { messageIds } })
    return res.data
  } catch (error) {
    throw new Error(error.response?.data?.error || 'ลบข้อความไม่สำเร็จ')
  }
}

/**
 * ส่งต่อข้อความที่เลือกไปยังกลุ่ม/DM อื่นใน LINE จริง (push message)
 */
export async function forwardMessages(messageIds, targetGroupId) {
  try {
    const res = await axiosInstance.post('/api/messages/forward', { messageIds, targetGroupId })
    return res.data
  } catch (error) {
    throw new Error(error.response?.data?.error || 'ส่งต่อไม่สำเร็จ')
  }
}

/**
 * พิมพ์ข้อความส่งตรงเข้าห้อง LINE (push) — ไม่บันทึกลงประวัติแชท
 */
export async function sendDirectMessage(groupId, text) {
  try {
    const res = await axiosInstance.post('/api/messages/send', { groupId, text })
    return res.data
  } catch (error) {
    throw new Error(error.response?.data?.error || 'ส่งข้อความไม่สำเร็จ')
  }
}

/**
 * ถาม AI ผู้ช่วยผ่าน dashboard โดยตรง (ไม่ผ่าน LINE) — ไม่บันทึกบทสนทนานี้ลง DB
 */
export async function askAssistant(text) {
  try {
    const res = await axiosInstance.post('/api/messages/ask', { text })
    return res.data
  } catch (error) {
    throw new Error(error.response?.data?.error || 'ถาม AI ไม่สำเร็จ')
  }
}

/**
 * เช็คว่าข้อความที่พิมพ์ในห้องแชทจริงตรงกับคำสั่ง "ค้นหา"/"สรุปเลย" ไหม (สโคปเฉพาะห้องนี้)
 * คืน { isCommand: false } ถ้าไม่ตรงคำสั่งไหนเลย
 */
export async function checkCommand(groupId, text) {
  try {
    const res = await axiosInstance.post('/api/messages/command', { groupId, text })
    return res.data
  } catch (error) {
    throw new Error(error.response?.data?.error || 'เช็คคำสั่งไม่สำเร็จ')
  }
}

/**
 * Get URL for attachment image
 */
export function getAttachmentUrl(attachmentId) {
  return `${API_BASE}/api/attachments/${attachmentId}/image`
}

/**
 * Generate AI summary for all messages on a specific date (or 'all' for full range)
 * range: { rangeValue, rangeUnit } — used when date === 'all'
 */
export async function summarizeDay(date, range = null, groupId = null, provider = 'groq') {
  try {
    const body = { date, provider }
    if (range) {
      body.rangeValue = range.rangeValue
      body.rangeUnit = range.rangeUnit
    }
    if (groupId && groupId !== 'all') {
      body.groupId = groupId
    }
    const res = await axiosInstance.post('/api/messages/summarize-day', body, {
      timeout: 120000, // 2 minutes for AI calls
    })
    return res.data
  } catch (error) {
    console.error('Error summarizing day:', error)
    throw new Error(error.response?.data?.error || 'Failed to generate summary')
  }
}

export async function searchMessages(q, limit = 30) {
  try {
    const res = await axiosInstance.get('/api/messages/search', { params: { q, limit } })
    return res.data
  } catch (error) {
    console.error('Error searching messages:', error)
    return []
  }
}

export async function fetchDashboardStats() {
  try {
    const res = await axiosInstance.get('/api/groups/stats')
    return res.data
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    throw new Error(error.response?.data?.error || 'Failed to fetch dashboard stats')
  }
}

export async function toggleImportant(messageId) {
  try {
    const res = await axiosInstance.patch(`/api/messages/${messageId}/important`)
    return res.data
  } catch (error) {
    console.error('Error toggling important:', error)
    throw new Error(error.response?.data?.error || 'Failed to toggle important')
  }
}

export async function fetchImportantMessages(groupId) {
  try {
    const params = groupId ? { groupId } : {}
    const res = await axiosInstance.get('/api/messages/important', { params })
    return res.data
  } catch (error) {
    console.error('Error fetching important messages:', error)
    return []
  }
}

export async function fetchActiveGroups(date, rangeValue, rangeUnit) {
  try {
    const res = await axiosInstance.get('/api/groups/active', {
      params: { date, rangeValue, rangeUnit }
    })
    return res.data
  } catch (error) {
    console.error('Error fetching active groups:', error)
    return []
  }
}
