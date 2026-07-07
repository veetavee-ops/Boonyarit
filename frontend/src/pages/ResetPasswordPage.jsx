// หน้านี้คือหน้า "ตั้งรหัสผ่านใหม่" — user จะมาถึงหน้านี้หลังจากกดลิงก์ในอีเมล
// ลิงก์จะมีรูปแบบ .../reset-password?token=xxxxxxxx เราต้องดึงค่า token จาก URL มาใช้
import { useState } from 'react'
import { resetPassword } from '../api/auth'
import './LoginPage.css' // ใช้ style ชุดเดียวกับหน้า login

export default function ResetPasswordPage() {
  // อ่านค่า token จาก URL ตอนนี้เลย (ทำครั้งเดียวตอนหน้าโหลด ไม่ต้องใส่ใน useState ก็ได้เพราะ URL ไม่เปลี่ยนระหว่างอยู่หน้านี้)
  // window.location.search คือส่วนหลัง "?" ของ URL เช่น "?token=abc123"
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    // เช็คก่อนส่งไป backend ว่ารหัสผ่านที่พิมพ์ 2 ช่องตรงกันไหม (กันพิมพ์ผิดโดยไม่รู้ตัว)
    if (newPassword !== confirmPassword) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
      return
    }
    if (newPassword.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
      return
    }

    setLoading(true)
    try {
      const data = await resetPassword(token, newPassword)
      setMessage(data.message || 'ตั้งรหัสผ่านใหม่สำเร็จแล้ว')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ถ้า URL ไม่มี token เลย (เช่น user พิมพ์ URL เองมั่วๆ) ให้บอกตรงๆ ว่าลิงก์ไม่ถูกต้อง ไม่ต้องโชว์ฟอร์ม
  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <h1>ลิงก์ไม่ถูกต้อง</h1>
            <p>ไม่พบรหัสสำหรับตั้งรหัสผ่านใหม่ กรุณาขอลิงก์ใหม่อีกครั้งจากหน้าล็อกอิน</p>
          </div>
          <button type="button" className="btn-back" onClick={() => { window.location.href = '/' }}>
            ← กลับไปหน้าล็อกอิน
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">
            {/* ไอคอนกุญแจ บอกว่าเป็นหน้าเกี่ยวกับรหัสผ่าน */}
            <svg viewBox="0 0 24 24" fill="white" width="28" height="28">
              <path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
            </svg>
          </div>
          <h1>ตั้งรหัสผ่านใหม่</h1>
          <p>กรอกรหัสผ่านใหม่ที่ต้องการใช้</p>
        </div>

        {/* ถ้ายังไม่สำเร็จ ให้โชว์ฟอร์ม */}
        {!message && (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label>รหัสผ่านใหม่</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="อย่างน้อย 6 ตัวอักษร"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>ยืนยันรหัสผ่านใหม่</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="พิมพ์รหัสผ่านใหม่อีกครั้ง"
                required
              />
            </div>

            {error && <div className="error-message">⚠️ {error}</div>}

            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? 'กำลังบันทึก...' : 'ตั้งรหัสผ่านใหม่'}
            </button>
          </form>
        )}

        {/* ถ้าสำเร็จแล้ว โชว์ข้อความ + ปุ่มไปหน้า login */}
        {message && (
          <>
            <div className="success-message">✅ {message}</div>
            <button
              type="button"
              className="btn-login"
              style={{ marginTop: 16 }}
              onClick={() => { window.location.href = '/' }}
            >
              ไปหน้าล็อกอิน
            </button>
          </>
        )}
      </div>
    </div>
  )
}
