import { useEffect, useState } from 'react'
import MessageBubble from '../MessageBubble/MessageBubble'
import { fetchMessageContext } from '../../api/messages'
import { scrollToAndHighlightMessage } from '../../utils/helpers'
import './MessageJumpModal.css'

// Popup ดูอย่างเดียว — เปิดจากลิงก์ผลค้นหาข้อความ (path "/app-jump" ที่ ChatWindow ดักไว้)
// โหลดข้อความรอบๆ (25 ก่อนหน้า + ตัวเอง + 25 หลัง) ของห้องนั้นมาแสดง แล้ว scroll+ไฮไลต์ไปยังข้อความเป้าหมาย
export default function MessageJumpModal({ messageId, onClose, myLineUserId, onOpenInChat, highlightKeyword }) {
  const [messages, setMessages] = useState([])
  const [groupId, setGroupId] = useState(null)
  const [groupName, setGroupName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchMessageContext(messageId, 25)
      .then(({ groupId: gid, messages: msgs }) => {
        if (cancelled) return
        setMessages(msgs)
        setGroupId(gid)
        const withGroupName = msgs.find((m) => m.group?.groupName)
        setGroupName(withGroupName?.group?.groupName || 'ข้อความส่วนตัว (DM)')
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [messageId])

  // scroll ไปยังข้อความเป้าหมาย + ไฮไลต์ค้างไว้ (ไม่จางหาย) หลังโหลดเสร็จ — ลองซ้ำเองถ้ายังไม่เจอ
  useEffect(() => {
    if (loading || messages.length === 0) return
    scrollToAndHighlightMessage(messageId)
  }, [loading, messages, messageId])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="jump-modal-overlay" onClick={onClose}>
      <div className="jump-modal" onClick={(e) => e.stopPropagation()}>
        <div className="jump-modal-header">
          {groupId && onOpenInChat ? (
            <button
              className="jump-modal-title jump-modal-title--link"
              onClick={() => onOpenInChat(groupId, messageId, highlightKeyword)}
              title="เข้าห้องแชทนี้เลย"
            >
              {groupName || 'กำลังโหลด...'}
            </button>
          ) : (
            <span className="jump-modal-title">{groupName || 'กำลังโหลด...'}</span>
          )}
          <button className="jump-modal-close" onClick={onClose} aria-label="ปิด">×</button>
        </div>
        <div className="jump-modal-body">
          {loading ? (
            <div className="jump-modal-empty">กำลังโหลด...</div>
          ) : error ? (
            <div className="jump-modal-empty">{error}</div>
          ) : messages.length === 0 ? (
            <div className="jump-modal-empty">ไม่พบข้อความ</div>
          ) : (
            messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                prevMsg={messages[i - 1]}
                allMessages={messages}
                myLineUserId={myLineUserId}
                highlightKeyword={msg.id === messageId ? highlightKeyword : undefined}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
