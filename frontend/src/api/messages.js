import axios from 'axios'

// Get API base URL from environment variable or use default
const API_BASE = import.meta.env.VITE_API_URL;

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
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem('token')
      window.location.href = '/'
    }
    return Promise.reject(error)
  }
)

/**
 * Fetch all groups (private chats and group chats) for a specific date
 */
export async function fetchGroups(date) {
  try {
    const res = await axiosInstance.get('/api/groups', { params: { date } })
    return res.data
  } catch (error) {
    console.error('Error fetching groups:', error)
    throw new Error(error.response?.data?.error || 'Failed to fetch groups')
  }
}

/**
 * Fetch list of dates that have messages
 */
export async function fetchAvailableDates() {
  try {
    const res = await axiosInstance.get('/api/dates')
    return res.data
  } catch (error) {
    console.error('Error fetching dates:', error)
    return [] // Return empty array on error to allow fallback
  }
}

/**
 * Fetch messages for a specific group and date
 */
export async function fetchMessages({ groupId, date } = {}) {
  try {
    const params = {}
    if (groupId) params.groupId = groupId
    if (date) params.date = date

    const res = await axiosInstance.get('/api/messages', { params })
    return res.data
  } catch (error) {
    console.error('Error fetching messages:', error)
    throw new Error(error.response?.data?.error || 'Failed to fetch messages')
  }
}

/**
 * Get URL for attachment image
 */
export function getAttachmentUrl(attachmentId) {
  return `${API_BASE}/api/attachments/${attachmentId}/image`
}

/**
 * Generate AI summary for all messages on a specific date
 */
export async function summarizeDay(date) {
  try {
    const res = await axiosInstance.post('/api/messages/summarize-day', { date })
    return res.data
  } catch (error) {
    console.error('Error summarizing day:', error)
    throw new Error(error.response?.data?.error || 'Failed to generate summary')
  }
}
