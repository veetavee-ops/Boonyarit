import { format, subDays } from 'date-fns'
import { th } from 'date-fns/locale'

export const getLast7Days = () =>
  Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), i), 'yyyy-MM-dd'))

export const formatDateLabel = (date) => {
  const today = format(new Date(), 'yyyy-MM-dd')
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  if (date === today) return 'วันนี้'
  if (date === yesterday) return 'เมื่อวาน'
  return format(new Date(date), 'd MMM', { locale: th })
}

export const formatTime = (iso) => format(new Date(iso), 'HH:mm')

export const getInitials = (name) => {
  if (!name) return '?'
  const parts = name.split(' ')
  return parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)
}

export const getColor = (str) => {
  const colors = ['#c0392b', '#2980b9', '#27ae60', '#d35400', '#8e44ad', '#16a085', '#c34113']
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

export const formatFileSize = (bytes) => {
  if (!bytes) return ''
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}