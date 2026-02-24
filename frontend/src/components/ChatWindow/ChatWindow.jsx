import { useEffect, useRef, useState } from 'react'
import { getInitials, getColor } from '../../utils/helpers'
import MessageBubble from '../MessageBubble/MessageBubble'
import MediaGallery from '../MediaGallery/MediaGallery'
import './ChatWindow.css'

export default function ChatWindow({
  currentGroup,
  messages,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  search,
  onSearchChange
}) {
  const messagesEndRef = useRef(null)
  const containerRef = useRef(null)
  const prevScrollHeight = useRef(0)
  const [showGallery, setShowGallery] = useState(false)

  const prevGroupRef = useRef(currentGroup?.groupId)

  // ✅ Auto-scroll to bottom (only on initial load or new message)
  useEffect(() => {
    if (!messagesEndRef.current || loading) return

    const isNewGroup = prevGroupRef.current !== currentGroup?.groupId
    const scrollType = isNewGroup ? 'auto' : 'smooth'

    // Skip auto-scroll to bottom if we are just loading MORE older messages
    if (prevScrollHeight.current > 0) return

    if (isNewGroup) {
      prevGroupRef.current = currentGroup?.groupId
    }

    const scrollToBottom = (behavior) => {
      messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' })
    }

    scrollToBottom(scrollType)

    // เลื่อนลงไปอีกครั้งเพื่อรองรับรูปภาพที่เพิ่งโหลดเสร็จ (ซึ่งจะดันข้อความขึ้น)
    const t1 = setTimeout(() => scrollToBottom(scrollType), 150)
    const t2 = setTimeout(() => scrollToBottom('auto'), 500)
    const t3 = setTimeout(() => scrollToBottom('auto'), 1000)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [messages, loading, currentGroup?.groupId, search])

  // ✅ Maintain scroll position when loading older messages
  useEffect(() => {
    if (!loadingMore && prevScrollHeight.current > 0 && containerRef.current) {
      const newScrollHeight = containerRef.current.scrollHeight
      const heightDiff = newScrollHeight - prevScrollHeight.current
      containerRef.current.scrollTop += heightDiff
      prevScrollHeight.current = 0 // Reset after applying
    }
  }, [messages, loadingMore])

  const handleScroll = (e) => {
    if (e.target.scrollTop === 0 && hasMore && !loadingMore && onLoadMore) {
      prevScrollHeight.current = e.target.scrollHeight
      onLoadMore()
    }
  }

  useEffect(() => {
    setShowGallery(false)
  }, [currentGroup])

  const filtered = search
    ? messages.filter(m =>
      m.text?.toLowerCase().includes(search.toLowerCase()) ||
      m.user?.displayName?.toLowerCase().includes(search.toLowerCase())
    )
    : messages

  const stats = {
    total: filtered.length,
    images: filtered.reduce((sum, m) => {
      if (m.messageType === 'image') {
        return sum + (m.metadata?.imageCount || 1)
      }
      return sum
    }, 0),
    users: currentGroup?.isPrivate ? 1 : new Set(filtered.map(m => m.userId)).size,
  }

  return (
    <main className="main">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="header">
        <div className="header-left">
          <div
            className={`group-avatar-lg${currentGroup?.isPrivate ? ' group-avatar-lg--private' : ''}`}
            style={{ background: currentGroup ? getColor(currentGroup.groupName) : '#dde3ea' }}
          >
            {currentGroup?.isPrivate ? (
              <svg viewBox="0 0 24 24" fill="white" width="18" height="18">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            ) : (
              currentGroup ? getInitials(currentGroup.groupName) : (
                <svg viewBox="0 0 24 24" fill="rgba(0,0,0,0.2)" width="20" height="20">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                </svg>
              )
            )}
          </div>
          <div className="header-group-info">
            <h1 className="group-title">
              {currentGroup?.groupName || 'เลือกแชท / กลุ่ม'}
            </h1>
            <p className="group-sub">
              {currentGroup?.isPrivate ? 'แชทส่วนตัว' : 'กลุ่ม'} · {filtered.length} ข้อความ
            </p>
          </div>
        </div>

        <div className="header-right">
          {currentGroup && (
            <button
              className={`btn-media-gallery${showGallery ? ' active' : ''}`}
              onClick={() => setShowGallery(v => !v)}
              title="ดูสื่อ ไฟล์ และลิ้งค์"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
              </svg>
              <span className="btn-media-label">สื่อ</span>
            </button>
          )}

          <div className="search-wrapper">
            <svg className="search-icon" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
            <input
              className="search"
              placeholder="ค้นหาข้อความ..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
            />
          </div>
        </div>
      </header>

      {/* ── Main content area ──────────────────────────────── */}
      <div className="chat-body">
        <div className="messages" ref={containerRef} onScroll={handleScroll}>
          {loading && !loadingMore && (
            <div className="empty">
              <div className="spinner"></div>
              <p>กำลังโหลด...</p>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="empty">
              <div className="empty-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" width="52" height="52" opacity="0.3">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                </svg>
              </div>
              <p>ไม่มีข้อความ</p>
            </div>
          )}

          {loadingMore && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
              <div className="spinner" style={{ width: '24px', height: '24px', borderWidth: '2px' }}></div>
            </div>
          )}

          {!loading && filtered.map((msg, i) => {
            const dateObj = msg.timestamp ? new Date(msg.timestamp) : null
            const now = new Date()
            const isToday = dateObj && dateObj.toDateString() === now.toDateString()
            const isYesterday = dateObj && dateObj.toDateString() === new Date(now.setDate(now.getDate() - 1)).toDateString()

            const dateStr = dateObj ? dateObj.toDateString() : null
            const prevDateObj = filtered[i - 1]?.timestamp ? new Date(filtered[i - 1].timestamp) : null
            const prevDateStr = prevDateObj ? prevDateObj.toDateString() : null
            const showDateSep = dateStr && dateStr !== prevDateStr

            let msgDate = dateObj ? dateObj.toLocaleDateString('th-TH', {
              weekday: 'long', year: 'numeric', month: 'short', day: 'numeric'
            }) : null

            if (isToday) msgDate = `วันนี้, ${msgDate?.split(',')[1] || msgDate}`
            if (isYesterday) msgDate = `เมื่อวานนี้, ${msgDate?.split(',')[1] || msgDate}`

            return (
              <div key={msg.id} style={{ display: 'contents' }}>
                {showDateSep && (
                  <div className="date-separator">
                    <span className="date-separator-label">{msgDate}</span>
                  </div>
                )}
                <MessageBubble msg={msg} prevMsg={filtered[i - 1]} />
              </div>
            )
          })}

          <div ref={messagesEndRef} />
        </div>

        {showGallery && (
          <MediaGallery
            messages={messages}
            onClose={() => setShowGallery(false)}
          />
        )}
      </div>

      {/* ── Stats footer ───────────────────────────────────── */}
      {filtered.length > 0 && (
        <footer className="stats">
          <div className="stat">
            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
            </svg>
            {stats.total}
          </div>
          <div className="stat">
            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
            </svg>
            {stats.images}
          </div>
          <div className="stat">
            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
            {stats.users} คน
          </div>
        </footer>
      )}
    </main>
  )
}
