import { useState } from 'react'
import { login } from '../api/auth'
import './LoginPage.css'

// ไอคอนโลโก้ Boonyarit — วาดเป็นเอกสารที่ซ้อนกันอยู่ (สื่อถึง "เอกสารที่เก็บ/จัดหมวดหมู่แล้ว")
// พร้อมประกายเล็กๆ มุมขวาบนแทนความหมาย "AI ช่วยจัดการให้"
function BoonyaritMark({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 6h14l8 8v20a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Z" />
      <path d="M27 6v8h8" />
      <path d="M16 22h9" opacity={0.9} />
      <path d="M16 27h13" opacity={0.7} />
      <path
        d="M35 4.5l1.1 2.9L39 8.5l-2.9 1.1L35 12.5l-1.1-2.9L31 8.5l2.9-1.1L35 4.5Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  )
}

// ไอคอนรูปคน — วางไว้ในช่อง Username
function UserIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

// ไอคอนกุญแจล็อก — วางไว้ในช่อง Password
function LockIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

// ไอคอนรูปตา — ปุ่มกด "แสดง/ซ่อน" รหัสผ่าน (off = true คือกำลังโชว์รหัสผ่านอยู่ เลยโชว์ตาปิด)
function EyeIcon({ className = '', off = false }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {off ? (
        <>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <path d="m2 2 20 20" />
        </>
      ) : (
        <>
          <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  )
}

// ไอคอนเตือน (วงกลม + เครื่องหมายตกใจ) — ใช้แทน emoji ⚠️ เดิม ให้ดูเรียบร้อยขึ้น
function AlertIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  )
}

// ไอคอนหมุนๆ ตอนกำลังโหลด (loading spinner) — หมุนด้วย CSS class "spin" ใน LoginPage.css
function SpinnerIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2.4} opacity={0.25} />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  )
}

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false) // true = กำลังโชว์รหัสผ่านเป็นตัวหนังสือ (ไม่ใช่จุดๆ)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const data = await login(username, password)

      if (typeof onLogin === 'function') {
        onLogin(data.admin)
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error ||
        err.response?.data?.details ||
        err.message ||
        'Login failed'

      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">
            <BoonyaritMark className="login-icon-svg" />
          </div>
          <h1>Boonyarit</h1>
          <p>Your smart document assistant — collect, organize &amp; archive every file.</p>
        </div>

        {/* แถบแจ้ง error สีแดงอ่อน โชว์เฉพาะตอน login ไม่ผ่าน */}
        {error && (
          <div className="error-message">
            <AlertIcon className="error-icon" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            {/* ครอบ input ด้วย div ที่ position: relative เพื่อวางไอคอนคนซ้อนทับด้านซ้ายของช่องกรอก */}
            <div className="input-wrap">
              <UserIcon className="input-icon" />
              <input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="your.username"
                required
                autoFocus
                autoComplete="username"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrap">
              <LockIcon className="input-icon" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
              {/* ปุ่มรูปตา กดสลับ showPassword true/false เพื่อโชว์/ซ่อนรหัสผ่าน */}
              <button
                type="button"
                className="input-icon-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              >
                <EyeIcon off={showPassword} />
              </button>
            </div>
          </div>

          <button type="submit" className="btn-login" disabled={loading}>
            {loading && <SpinnerIcon className="btn-spinner" />}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          {/* ลิงก์ไปหน้าลืมรหัสผ่าน — เปลี่ยนหน้าโดยเปลี่ยน URL ตรงๆ (โปรเจกต์นี้ไม่ได้ใช้ react-router) */}
          <div className="login-links">
            <button
              type="button"
              className="btn-back"
              onClick={() => { window.location.href = '/forgot-password' }}
            >
              Forgot password?
            </button>
          </div>
        </form>
      </div>

      <p className="login-footer">Protected workspace · Boonyarit Document Assistant</p>
    </div>
  )
}
