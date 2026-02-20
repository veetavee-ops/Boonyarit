import { useState } from 'react'
import axios from 'axios'
import './LoginPage.css' // Reuse login styles

export default function RegisterPage() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [inviteCode, setInviteCode] = useState('')
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setSuccess('')
        setLoading(true)

        try {
            // Use direct axios call since it's a special endpoint
            const API_URL = import.meta.env.VITE_API_URL
            await axios.post(`${API_URL}/api/auth/register`, {
                username,
                password,
                inviteCode
            })

            setSuccess('✅ Admin registered successfully!')
            setUsername('')
            setPassword('')
            setInviteCode('')

            // Optional: Redirect to login after 2 seconds
            setTimeout(() => {
                window.location.href = '/'
            }, 2000)

        } catch (err) {
            setError(err.response?.data?.error || 'Registration failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-header">
                    <div className="login-icon" style={{ background: '#ff9800' }}>🔐</div>
                    <h1>Admin Register</h1>
                    <p>Create New Admin Account</p>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group">
                        <label>Invite Code</label>
                        <input
                            type="password"
                            value={inviteCode}
                            onChange={e => setInviteCode(e.target.value)}
                            placeholder="Enter secret invite code"
                            required
                            autoFocus
                        />
                    </div>

                    <div className="form-group">
                        <label>Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            placeholder="Choose username"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Choose password"
                            required
                        />
                    </div>

                    {error && <div className="error-message">⚠️ {error}</div>}
                    {success && <div className="success-message" style={{ color: 'green', fontSize: '13px', marginBottom: '15px', textAlign: 'center' }}>{success}</div>}

                    <button type="submit" className="btn-login" disabled={loading} style={{ background: '#ff9800' }}>
                        {loading ? 'Creating...' : 'Register'}
                    </button>

                    <button
                        type="button"
                        className="btn-link"
                        onClick={() => window.location.href = '/'}
                        style={{ marginTop: '10px', background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '12px' }}
                    >
                        ← Back to Login
                    </button>
                </form>
            </div>
        </div>
    )
}
