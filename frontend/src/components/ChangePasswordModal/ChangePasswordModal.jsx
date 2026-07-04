// Modal (หน้าต่างลอย) สำหรับ "เปลี่ยนรหัสผ่าน" + "ตั้งอีเมลกู้คืนรหัสผ่าน" ตอนที่ user login อยู่แล้ว
// ต่างจาก ForgotPasswordPage ตรงที่อันนี้ต้องรู้รหัสผ่านเดิมก่อน (เพราะ login อยู่แล้ว ไม่ใช่ลืมรหัสผ่าน)
import { useState } from 'react'
import { changePassword, updateProfile } from '../../api/auth'
import './ChangePasswordModal.css'

// onClose = ฟังก์ชันปิด modal (เรียกตอนกดปุ่ม X หรือกดพื้นหลังรอบนอก)
// currentEmail = อีเมลที่ผูกไว้อยู่ตอนนี้ (อาจเป็น null ถ้ายังไม่เคยตั้ง)
// onEmailSaved = แจ้ง parent ให้อัปเดต state admin.email หลังบันทึกสำเร็จ
export default function ChangePasswordModal({ onClose, currentEmail, onEmailSaved }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  // --- ส่วนตั้งอีเมลกู้คืนรหัสผ่าน (แยกฟอร์มจากเปลี่ยนรหัสผ่านด้านล่าง) ---
  const [emailDraft, setEmailDraft] = useState(currentEmail || '')
  const [emailError, setEmailError] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)

  const handleSaveEmail = async (e) => {
    e.preventDefault()
    setEmailError('')
    setEmailMessage('')
    setEmailSaving(true)
    try {
      const data = await updateProfile({ email: emailDraft.trim() })
      onEmailSaved?.(data.email)
      setEmailMessage('บันทึกอีเมลสำเร็จ')
    } catch (err) {
      setEmailError(err.message)
    } finally {
      setEmailSaving(false)
    }
  }

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
          <h2>ตั้งค่าบัญชี</h2>
          <button className="cpw-close" onClick={onClose}>✕</button>
        </div>

        {/* ── อีเมลกู้คืนรหัสผ่าน — ใช้ตอนกด "ลืมรหัสผ่าน" ตอนล็อกอินไม่ได้ ── */}
        <form onSubmit={handleSaveEmail} className="cpw-form">
          <div className="cpw-field">
            <label>อีเมลกู้คืนรหัสผ่าน</label>
            <input
              type="email"
              value={emailDraft}
              onChange={e => setEmailDraft(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          {emailError && <div className="cpw-error">⚠️ {emailError}</div>}
          {emailMessage && <div className="cpw-success">✅ {emailMessage}</div>}

          <button type="submit" className="cpw-submit" disabled={emailSaving}>
            {emailSaving ? 'กำลังบันทึก...' : 'บันทึกอีเมล'}
          </button>
        </form>

        <hr className="cpw-divider" />

        <h3 className="cpw-subtitle">เปลี่ยนรหัสผ่าน</h3>
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
