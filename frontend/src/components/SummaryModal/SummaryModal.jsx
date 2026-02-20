import { useMemo } from 'react'
import './SummaryModal.css'

export default function SummaryModal({ summary, onClose, loading, error }) {
  // ✅ ย้าย useMemo ขึ้นมาด้านบน (ก่อน early return)
  const renderSummary = useMemo(() => {
    return (text) => {
      if (!text) return null

      const lines = text.split('\n')
      const elements = []
      let currentList = []
      let listType = null
      let listCounter = 0

      lines.forEach((line, index) => {
        // Header
        if (line.match(/^#+\s+(.+)/) || line.match(/^\*\*(.+)\*\*$/)) {
          if (currentList.length > 0) {
            elements.push(renderList(currentList, listType, listCounter++))
            currentList = []
            listType = null
          }
          const text = line.replace(/^#+\s+/, '').replace(/^\*\*(.+)\*\*$/, '$1')
          elements.push(
            <h3 key={index} className="summary-heading">{text}</h3>
          )
        }
        // Emoji headers
        else if (line.match(/^(📊|📌|✨|⚠️|🎯|💡)\s*\*?\*?(.+)\*?\*?/)) {
          if (currentList.length > 0) {
            elements.push(renderList(currentList, listType, listCounter++))
            currentList = []
            listType = null
          }
          const match = line.match(/^(📊|📌|✨|⚠️|🎯|💡)\s*\*?\*?(.+)\*?\*?/)
          elements.push(
            <div key={index} className="summary-section">
              <div className="section-icon">{match[1]}</div>
              <h3 className="section-title">{match[2].replace(/\*\*/g, '')}</h3>
            </div>
          )
        }
        // Numbered items
        else if (line.match(/^([1-9]️⃣|[0-9]+\.)\s*(.+)/)) {
          if (currentList.length > 0 && listType !== 'numbered') {
            elements.push(renderList(currentList, listType, listCounter++))
            currentList = []
          }
          listType = 'numbered'
          const match = line.match(/^([1-9]️⃣|[0-9]+\.)\s*(.+)/)
          currentList.push(match[2])
        }
        // Bullet items
        else if (line.match(/^[-*•✓]\s+(.+)/)) {
          if (currentList.length > 0 && listType !== 'bullet') {
            elements.push(renderList(currentList, listType, listCounter++))
            currentList = []
          }
          listType = 'bullet'
          const match = line.match(/^[-*•✓]\s+(.+)/)
          currentList.push(match[1])
        }
        // Sub-items
        else if (line.match(/^\s{2,}[-*•]\s+(.+)/)) {
          const match = line.match(/^\s{2,}[-*•]\s+(.+)/)
          if (currentList.length > 0) {
            const lastIndex = currentList.length - 1
            if (typeof currentList[lastIndex] !== 'object') {
              currentList[lastIndex] = {
                text: currentList[lastIndex],
                subItems: []
              }
            }
            currentList[lastIndex].subItems.push(match[1])
          }
        }
        // Separator
        else if (line.match(/^[-_*]{3,}$/)) {
          if (currentList.length > 0) {
            elements.push(renderList(currentList, listType, listCounter++))
            currentList = []
            listType = null
          }
          elements.push(<hr key={index} className="summary-divider" />)
        }
        // Empty line
        else if (line.trim() === '') {
          if (currentList.length > 0) {
            elements.push(renderList(currentList, listType, listCounter++))
            currentList = []
            listType = null
          }
        }
        // Regular text
        else if (line.trim() !== '') {
          if (currentList.length > 0) {
            elements.push(renderList(currentList, listType, listCounter++))
            currentList = []
            listType = null
          }
          const formatted = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          elements.push(
            <p key={index} className="summary-paragraph" dangerouslySetInnerHTML={{ __html: formatted }} />
          )
        }
      })

      if (currentList.length > 0) {
        elements.push(renderList(currentList, listType, listCounter++))
      }

      return elements
    }
  }, [])

  const renderList = (items, type, key) => {
    if (type === 'numbered') {
      return (
        <ol key={`list-${key}`} className="summary-list numbered">
          {items.map((item, i) => (
            <li key={i}>
              {typeof item === 'object' ? (
                <>
                  <span>{item.text}</span>
                  {item.subItems && item.subItems.length > 0 && (
                    <ul className="summary-sublist">
                      {item.subItems.map((sub, j) => (
                        <li key={j}>{sub}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                item
              )}
            </li>
          ))}
        </ol>
      )
    } else {
      return (
        <ul key={`list-${key}`} className="summary-list bullet">
          {items.map((item, i) => (
            <li key={i}>
              {typeof item === 'object' ? (
                <>
                  <span>{item.text}</span>
                  {item.subItems && item.subItems.length > 0 && (
                    <ul className="summary-sublist">
                      {item.subItems.map((sub, j) => (
                        <li key={j}>{sub}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                item
              )}
            </li>
          ))}
        </ul>
      )
    }
  }

  // ✅ early return อยู่หลัง hooks
  if (!summary && !loading && !error) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-content">
            <div className="modal-title-icon">🤖</div>
            <div>
              <h2 className="modal-title">สรุปบทสนทนาทั้งวัน</h2>
              {summary && !loading && (
                <p className="modal-subtitle">
                  {summary.messageCount} ข้อความจาก {summary.groupCount} กลุ่ม/แชท
                </p>
              )}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {loading && (
            <div className="modal-loading">
              <div className="spinner-container">
                <div className="spinner"></div>
              </div>
              <p className="loading-text">AI กำลังวิเคราะห์และสรุปบทสนทนา...</p>
              <p className="loading-note">อาจใช้เวลา 3-10 วินาที กรุณารอสักครู่</p>
            </div>
          )}

          {error && (
            <div className="modal-error">
              <div className="error-icon">⚠️</div>
              <p className="error-text">{error}</p>
              <button className="btn-retry" onClick={onClose}>ปิด</button>
            </div>
          )}

          {summary && !loading && (
            <div className="modal-summary">
              <div className="summary-content">
                {renderSummary(summary.summary)}
              </div>
              
              <div className="summary-footer">
                <div className="summary-meta">
                  <span className="meta-item">
                    <span className="meta-icon">💬</span>
                    {summary.messageCount} ข้อความ
                  </span>
                  <span className="meta-item">
                    <span className="meta-icon">👥</span>
                    {summary.groupCount} กลุ่ม
                  </span>
                  {summary.model && (
                    <span className="meta-item">
                      <span className="meta-icon">🤖</span>
                      {summary.model}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}