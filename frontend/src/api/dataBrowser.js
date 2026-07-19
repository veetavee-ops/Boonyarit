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

export async function fetchDataBrowserTables() {
  const res = await axiosInstance.get('/api/data-browser/tables')
  return res.data
}

export async function fetchDataBrowserRows(key, { page } = {}) {
  const res = await axiosInstance.get(`/api/data-browser/${key}`, { params: { page } })
  return res.data
}

export async function fetchDataBrowserSchema(key) {
  const res = await axiosInstance.get(`/api/data-browser/${key}/schema`)
  return res.data
}

export async function fetchDataBrowserDiagram() {
  const res = await axiosInstance.get('/api/data-browser/diagram')
  return res.data
}
