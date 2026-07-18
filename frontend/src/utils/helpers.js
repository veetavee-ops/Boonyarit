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

// รูปแบบวันที่สั้นแบบ วัน + เดือน/ปีย่อภาษาไทย ใช้กับตัวเลือกวันที่สรุป เช่น "17 ก.ค. 26"
export const formatDateShort = (date) =>
  format(new Date(date), 'd MMM yy', { locale: th })

// label ของตัวเลือก "วันที่สรุป" — วันนี้/เมื่อวานใส่วงเล็บวันที่กำกับ (มีประโยชน์),
// วันอื่นๆ โชว์วันที่แบบสั้นตรงๆ ไม่ซ้ำซ้อนกับ formatDateLabel (ซึ่งไม่มีปี) อีกรอบ
export const formatDateOptionLabel = (date) => {
  const label = formatDateLabel(date)
  if (label === 'วันนี้' || label === 'เมื่อวาน') return `${label} (${formatDateShort(date)})`
  return formatDateShort(date)
}

// เวลาแสดงในรายการกลุ่ม (sidebar) — วันนี้โชว์แค่เวลา (HH:mm), เก่ากว่านั้นโชว์วันที่แบบสั้น (d MMM)
export const formatGroupTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const today = format(new Date(), 'yyyy-MM-dd')
  const dateStr = format(d, 'yyyy-MM-dd')
  return dateStr === today ? format(d, 'HH:mm') : format(d, 'd MMM yy', { locale: th })
}

// เช็คว่าเวลาที่ให้มาเป็น "วันนี้" ไหม (เทียบตามเวลาเครื่อง/browser)
export const isToday = (iso) => {
  if (!iso) return false
  const d = new Date(iso)
  if (isNaN(d)) return false
  return format(d, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
}

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

// เลื่อนไปหา element ที่มี data-id ตรงกับ id แล้วไฮไลต์ค้างไว้ — ลองซ้ำด้วย setTimeout จนกว่าจะเจอ
// (กันกรณี element ยังไม่ถูก mount ตอน effect รันครั้งแรก เช่น ระหว่างสลับกลุ่ม/โหลดข้อความ)
// คืนค่า true ถ้าเจอและทำสำเร็จ, false ถ้าลองครบจำนวนแล้วยังไม่เจอ (element อาจไม่มีอยู่จริง)
export function scrollToAndHighlightMessage(id, attempt = 0) {
  const el = document.querySelector(`[data-id="${id}"]`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('highlight-search-target')
    return true
  }
  if (attempt < 40) {
    setTimeout(() => scrollToAndHighlightMessage(id, attempt + 1), 50)
  }
  return false
}