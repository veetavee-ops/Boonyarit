// หน้านี้คือหน้า "ลืมรหัสผ่าน" — ให้ user กรอกอีเมล แล้วกดส่ง
// ระบบจะส่งลิงก์รีเซ็ตรหัสผ่านไปทางอีเมลที่กรอก (ไม่ว่าจะเจอ user จริงหรือไม่ ก็จะขึ้นข้อความเดียวกันเสมอ
// เพื่อความปลอดภัย ไม่ให้คนร้ายเดาได้ว่าอีเมลไหนมีอยู่ในระบบบ้าง)
import { useState } from 'react' // hook ไว้เก็บค่าตัวแปรที่เปลี่ยนแล้วหน้าจอ re-render ใหม่
import { forgotPassword } from '../api/auth' // ฟังก์ชันเรียก backend ที่เราเพิ่งสร้างไว้
import './LoginPage.css' // ใช้ style เดียวกับหน้า login เพื่อให้หน้าตาเข้าชุดกัน

// onBack คือฟังก์ชันที่เรียกไว้เผื่อ user กดปุ่ม "กลับไปหน้า login"
export default function ForgotPasswordPage({ onBack }) {
  const [email, setEmail] = useState('') // ค่าอีเมลที่ user พิมพ์ในช่อง input
  const [message, setMessage] = useState('') // ข้อความแจ้งผลสำเร็จ (สีเขียว)
  const [error, setError] = useState('') // ข้อความ error (สีแดง)
  const [loading, setLoading] = useState(false) // true ระหว่างรอ backend ตอบกลับ (ไว้ปิดปุ่มกันกดซ้ำ)

  // ฟังก์ชันนี้ทำงานตอน user กดปุ่ม submit ฟอร์ม
  const handleSubmit = async (e) => {
    e.preventDefault() // กันไม่ให้หน้าเว็บ reload เอง (พฤติกรรม default ของ form)
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const data = await forgotPassword(email.trim())
      // backend จะตอบข้อความกลับมาเสมอ (ไม่ว่าจะเจออีเมลจริงหรือไม่) — เอามาโชว์ตรงๆ เลย
      setMessage(data.message || 'ส่งคำขอเรียบร้อยแล้ว กรุณาตรวจสอบอีเมลของคุณ')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">
            {/* ไอคอนซองจดหมาย บอกว่าเป็นหน้าเกี่ยวกับอีเมล */}
            <svg viewBox="0 0 24 24" fill="white" width="28" height="28">
              <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
            </svg>
          </div>
          <h1>ลืมรหัสผ่าน</h1>
          <p>กรอกอีเมลที่ผูกกับบัญชี เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้</p>
        </div>

        {/* ถ้ายังไม่สำเร็จ (ยังไม่มี message) ให้โชว์ฟอร์มกรอกอีเมล */}
        {!message && (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>

            {error && <div className="error-message">⚠️ {error}</div>}

            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? 'กำลังส่ง...' : 'ส่งลิงก์รีเซ็ตรหัสผ่าน'}
            </button>
          </form>
        )}

        {/* ถ้าสำเร็จแล้ว (มี message) ให้โชว์ข้อความสีเขียวแทนฟอร์ม */}
        {message && <div className="success-message">✅ {message}</div>}

        {/* ปุ่มกลับไปหน้า login เสมอ ไม่ว่าจะสำเร็จหรือยัง */}
        <button type="button" className="btn-back" onClick={onBack} style={{ marginTop: 16 }}>
          ← กลับไปหน้าล็อกอิน
        </button>
      </div>
    </div>
  )
}
