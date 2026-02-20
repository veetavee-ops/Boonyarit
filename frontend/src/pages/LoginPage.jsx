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
          <div className="login-icon">💬</div>
          <h1>LINE Archive</h1>
          <p>Chat History Management</p>
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

      </div>
    </div>
  )
}