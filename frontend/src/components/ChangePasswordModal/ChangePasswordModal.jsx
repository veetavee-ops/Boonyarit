// Modal (หน้าต่างลอย) สำหรับ "เปลี่ยนรหัสผ่าน" ตอนที่ user login อยู่แล้ว
// ต่างจาก ForgotPasswordPage ตรงที่อันนี้ต้องรู้รหัสผ่านเดิมก่อน (เพราะ login อยู่แล้ว ไม่ใช่ลืมรหัสผ่าน)
import { useState } from 'react'
import { changePassword } from '../../api/auth'
import './ChangePasswordModal.css'

// onClose = ฟังก์ชันปิด modal (เรียกตอนกดปุ่ม X หรือกดพื้นหลังรอบนอก)
export default function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (newPassword !== confirmPassword) {
      setError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน')
      return
    }
    if (newPassword.length < 6) {
      setError('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร')
      return
    }

    setLoading(true)
    try {
      const data = await changePassword(currentPassword, newPassword)
      setMessage(data.message || 'เปลี่ยนรหัสผ่านสำเร็จ')
      // เคลียร์ช่อง input ทิ้งหลังสำเร็จ กันรหัสผ่านค้างอยู่บนหน้าจอ
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    // คลิกพื้นหลังสีดำโปร่งแสง (overlay) รอบนอกแล้วปิด modal ได้เลย
    <div className="cpw-overlay" onClick={onClose}>
      {/* stopPropagation กันไม่ให้คลิกข้างในกล่องแล้วโดนตีความว่าคลิก overlay (ปิด modal โดยไม่ตั้งใจ) */}
      <div className="cpw-card" onClick={e => e.stopPropagation()}>
        <div className="cpw-header">
          <h2>เปลี่ยนรหัสผ่าน</h2>
          <button className="cpw-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="cpw-form">
          <div className="cpw-field">
            <label>รหัสผ่านเดิม</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="cpw-field">
            <label>รหัสผ่านใหม่</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="อย่างน้อย 6 ตัวอักษร"
              required
            />
          </div>

          <div className="cpw-field">
            <label>ยืนยันรหัสผ่านใหม่</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className="cpw-error">⚠️ {error}</div>}
          {message && <div className="cpw-success">✅ {message}</div>}

          <button type="submit" className="cpw-submit" disabled={loading}>
            {loading ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
          </button>
        </form>
      </div>
    </div>
  )
}
