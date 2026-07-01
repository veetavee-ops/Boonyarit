import { useState } from 'react'
import { login } from '../api/auth'
import './LoginPage.css'

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)


  const handleSubmit = async (e) => {
    e.preventDefault()

    console.log('=== FORM SUBMIT ===')
    console.log('Username:', username)
    console.log('Password:', password ? '***' : 'empty')
    console.log('onLogin function:', typeof onLogin)

    setError('')
    setLoading(true)

    try {
      console.log('🔐 Calling login()...')
      const data = await login(username, password)

      console.log('✅ Login response:', data)
      console.log('   admin:', data.admin)
      console.log('   token:', data.token ? 'received' : 'missing')

      if (!onLogin) {
        console.error('❌ onLogin is undefined!')
        setError('Configuration error: onLogin missing')
        return
      }

      if (typeof onLogin === 'function') {
        onLogin(data.admin)
      }

    } catch (err) {
      console.error('❌ Login error:', err)
      console.error('   Response:', err.response)
      console.error('   Data:', err.response?.data)
      console.error('   Status:', err.response?.status)

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
            <svg viewBox="0 0 24 24" fill="white" width="28" height="28">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
            </svg>
          </div>
          <h1>Boonyarit LINE OA</h1>
          <p>Admin Dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}

          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        {/* ลิงก์ไปหน้าลืมรหัสผ่าน — เปลี่ยนหน้าโดยเปลี่ยน URL ตรงๆ (โปรเจกต์นี้ไม่ได้ใช้ react-router) */}
        <button
          type="button"
          className="btn-back"
          onClick={() => { window.location.href = '/forgot-password' }}
          style={{ marginTop: 12 }}
        >
          ลืมรหัสผ่าน?
        </button>
      </div>
    </div>
  )
}