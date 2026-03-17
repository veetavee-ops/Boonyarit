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
