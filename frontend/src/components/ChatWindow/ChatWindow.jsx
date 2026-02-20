import { useEffect, useRef } from 'react'
import { formatDateLabel, getInitials, getColor } from '../../utils/helpers'
import MessageBubble from '../MessageBubble/MessageBubble'
import './ChatWindow.css'

export default function ChatWindow({
  currentGroup,
  selectedDate,
  messages,
  loading,
  search,
  onSearchChange
}) {
  const messagesEndRef = useRef(null)

  // ✅ Auto-scroll เมื่อมีข้อความใหม่
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const filtered = search
    ? messages.filter(m =>
      m.text?.toLowerCase().includes(search.toLowerCase()) ||
      m.user?.displayName?.toLowerCase().includes(search.toLowerCase())
    )
    : messages

  const stats = {
    total: filtered.length,
    images: filtered.filter(m => m.messageType === 'image').length,
    users: new Set(filtered.map(m => m.userId)).size,
  }

  return (
    <main className="main">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div
            className="group-avatar-lg"
            style={{ background: currentGroup ? getColor(currentGroup.groupName) : '#ddd' }}
          >
            {currentGroup?.isPrivate ? '👤' : (currentGroup ? getInitials(currentGroup.groupName) : '?')}
          </div>
          <div>
            <h1 className="group-title">
              {currentGroup?.isPrivate && '💬 '}
              {currentGroup?.groupName || 'เลือกแชท/กลุ่ม'}
            </h1>
            <p className="group-sub">
              {filtered.length} ข้อความ · {formatDateLabel(selectedDate)}
            </p>
          </div>
        </div>
        <input
          className="search"
          placeholder="🔍 ค้นหา..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
      </header>

      {/* Messages */}
      <div className="messages">
        {loading && (
          <div className="empty">
            <div className="spinner"></div>
            <p>กำลังโหลด...</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="empty">
            <div className="empty-icon">📭</div>
            <p>ไม่มีข้อความ</p>
          </div>
        )}

        {!loading && filtered.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            prevMsg={filtered[i - 1]}
          />
        ))}

        {/* ✅ Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Stats */}
      {filtered.length > 0 && (
        <footer className="stats">
          <div className="stat">💬 {stats.total}</div>
          <div className="stat">🖼️ {stats.images}</div>
          <div className="stat">👥 {stats.users} คน</div>
        </footer>
      )}
    </main>
  )
}