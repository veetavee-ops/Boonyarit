import { formatTime, getColor, formatFileSize } from '../../utils/helpers'
import Avatar from '../Avatar/Avatar'
import { getAttachmentUrl } from '../../api/messages'
import './MessageBubble.css'

export default function MessageBubble({ msg, prevMsg }) {
  if (!msg) return null

  // Helper to safely get user info
  const getUserInfo = (m) => {
    return {
      userId: m.userId || 'unknown',
      displayName: m.user?.displayName || 'Unknown User',
      pictureUrl: m.user?.pictureUrl
    }
  }

  const currentUser = getUserInfo(msg)
  const prevUser = prevMsg ? getUserInfo(prevMsg) : null

  const isNewSender = !prevMsg || prevUser.userId !== currentUser.userId
  const userColor = getColor(currentUser.displayName)

  // Debug: Log if message type is unknown
  if (!['text', 'image', 'video', 'audio', 'file', 'location', 'sticker'].includes(msg.messageType)) {
    console.warn('Unknown message type:', msg.messageType, msg)
  }

  return (
    <div className={`msg ${isNewSender ? 'new' : ''}`} data-id={msg.id}>
      {/* Avatar */}
      <div className="msg-avatar">
        {isNewSender && (
          <Avatar
            name={currentUser.displayName}
            size={40}
            pictureUrl={currentUser.pictureUrl}
          />
        )}
      </div>

      {/* Content */}
      <div className="msg-content">
        {/* Meta (ชื่อ + เวลา) */}
        {isNewSender && (
          <div className="msg-meta">
            <span className="msg-name" style={{ color: userColor }}>
              {currentUser.displayName}
            </span>
            <span className="msg-time">{formatTime(msg.timestamp)}</span>
          </div>
        )}

        {/* Text */}
        {msg.messageType === 'text' && (
          <div className="msg-text">{msg.text || '(ไม่มีข้อความ)'}</div>
        )}

        {/* Images */}
        {msg.messageType === 'image' && msg.attachments && (
          <div className="msg-images">
            {msg.attachments.map(att => (
              <img
                key={att.id}
                src={getAttachmentUrl(att.id)}
                alt="รูปภาพ"
                className="msg-img"
                loading="lazy"
                onError={(e) => {
                  e.target.style.display = 'none'
                  console.error('Image load failed:', att.id)
                }}
              />
            ))}
          </div>
        )}

        {/* Video */}
        {msg.messageType === 'video' && (
          <div className="msg-file">
            🎥 วิดีโอ
            {msg.metadata?.duration && (
              <span className="msg-file-info">
                {(msg.metadata.duration / 1000).toFixed(0)} วินาที
              </span>
            )}
          </div>
        )}

        {/* Audio */}
        {msg.messageType === 'audio' && (
          <div className="msg-file">
            🎵 เสียง
            {msg.metadata?.duration && (
              <span className="msg-file-info">
                {(msg.metadata.duration / 1000).toFixed(0)} วินาที
              </span>
            )}
          </div>
        )}

        {/* File */}
        {msg.messageType === 'file' && (
          <div className="msg-file">
            📎 {msg.metadata?.fileName || 'ไฟล์แนบ'}
            {msg.metadata?.fileSize && (
              <span className="msg-file-info">
                {formatFileSize(msg.metadata.fileSize)}
              </span>
            )}
          </div>
        )}

        {/* Location */}
        {msg.messageType === 'location' && (
          <div className="msg-file">
            📍 {msg.metadata?.title || msg.metadata?.address || 'ตำแหน่งที่ตั้ง'}
          </div>
        )}

        {/* Sticker */}
        {msg.messageType === 'sticker' && (
          <div className="msg-sticker-wrapper">
            {msg.metadata?.stickerUrl ? (
              <img
                src={msg.metadata.stickerUrl}
                alt="Sticker"
                className="msg-sticker"
              />
            ) : (
              <span>[Sticker]</span>
            )}
          </div>
        )}

        {/* เวลา (กรณีข้อความต่อเนื่อง) */}
        {!isNewSender && (
          <span className="msg-time-small">{formatTime(msg.timestamp)}</span>
        )}
      </div>
    </div>
  )
}
