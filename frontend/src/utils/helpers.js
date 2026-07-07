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

// สีพื้นฐาน + สีเดียวกันแต่เข้มขึ้น (ไว้ทำไล่เฉด gradient) ของ avatar แต่ละสี
// เดิม getColor คืนสีเดียวแบน ๆ ตอนนี้คืนเป็น gradient เฉียง 135deg (สีอ่อน → สีเข้ม) แทน
// ใช้ตรงกับที่มีอยู่ (background: getColor(name)) ได้เลยเพราะ gradient ก็เป็นค่า background ที่ใช้แทนสีได้เหมือนกัน
export const getColor = (str) => {
  const gradients = [
    'linear-gradient(135deg, #c0392b, #96261a)',
    'linear-gradient(135deg, #2980b9, #1f6091)',
    'linear-gradient(135deg, #27ae60, #1d8449)',
    'linear-gradient(135deg, #d35400, #a84400)',
    'linear-gradient(135deg, #8e44ad, #6c3483)',
    'linear-gradient(135deg, #16a085, #117864)',
    'linear-gradient(135deg, #c34113, #96330e)',
  ]
  if (!str) return gradients[0]
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return gradients[Math.abs(hash) % gradients.length]
}

export const formatFileSize = (bytes) => {
  if (!bytes) return ''
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}