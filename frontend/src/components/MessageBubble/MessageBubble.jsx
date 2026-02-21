import { useState, useEffect, useCallback } from 'react'
import { formatTime, getColor, formatFileSize } from '../../utils/helpers'
import Avatar from '../Avatar/Avatar'
import { getAttachmentUrl } from '../../api/messages'
import './MessageBubble.css'

export default function MessageBubble({ msg, prevMsg }) {
  if (!msg) return null

  const [lightboxImg, setLightboxImg] = useState(null) // URL of image being viewed

  // Close on Escape key
  useEffect(() => {
    if (!lightboxImg) return
    const handleKey = (e) => {
      if (e.key === 'Escape') setLightboxImg(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightboxImg])

  const openLightbox = useCallback((url) => setLightboxImg(url), [])
  const closeLightbox = useCallback(() => setLightboxImg(null), [])

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

  return (
    <>
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
                  onClick={() => openLightbox(getAttachmentUrl(att.id))}
                  onError={(e) => {
                    e.target.style.display = 'none'
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

      {/* ✅ Lightbox Modal */}
      {lightboxImg && (
        <div className="lightbox-overlay" onClick={closeLightbox}>
          <button className="lightbox-close" onClick={closeLightbox} aria-label="ปิด">✕</button>
          <img
            className="lightbox-img"
            src={lightboxImg}
            alt="ภาพขยาย"
            onClick={(e) => e.stopPropagation()} // prevent close on image click
          />
        </div>
      )}
    </>
  )
}
