import { useState, useEffect } from 'react' // ✅ เพิ่ม useState, useEffect
import { formatDateLabel, getInitials, getColor, getLast7Days } from '../../utils/helpers'
import { fetchAvailableDates } from '../../api/messages' // ✅ Import API
import './Sidebar.css'

export default function Sidebar({
  isOpen, // New prop
  onClose, // New prop
  refreshKey, // ✅ Receive refreshKey
  selectedDate,
  selectedGroup,
  privateChats,
  realGroups,
  onSelectDate,
  onSelectGroup,
  onSummarizeDay
}) {
  // const dates = getLast7Days() // ❌ Remove static dates
  const [dates, setDates] = useState([])
  const [loadingDates, setLoadingDates] = useState(true)

  // ✅ Fetch dates on mount
  useEffect(() => {
    const loadDates = async () => {
      try {
        const availableDates = await fetchAvailableDates()

        if (availableDates.length > 0) {
          setDates(availableDates)

          // If current selected date is not in the list, select the newest one
          if (!availableDates.includes(selectedDate)) {
            // Optional: Force select newest date? 
            // Better to clear selection or select first one if user hasn't chosen?
            // Actually, App.jsx defaults to "today". If "today" has no messages, we might want to switch.
            // But for now, let's just populate the list. User can switch.
            // onSelectDate(availableDates[0]) // Safer to let user decide or App logic handle it, but let's just set the list.

            // Improvement: If "today" (default) is not in list, maybe switch to newest available?
            if (selectedDate === new Date().toISOString().split('T')[0]) {
              onSelectDate(availableDates[0])
            }
          }
        } else {
          // Fallback to today if no messages ever
          setDates([new Date().toISOString().split('T')[0]])
        }
      } catch (err) {
        console.error('Failed to load dates', err)
        setDates(getLast7Days()) // Fallback to last 7 days on error
      } finally {
        setLoadingDates(false)
      }
    }

    loadDates()
  }, [refreshKey]) // ✅ Add refreshKey dependency

  // ✅ สถานะการเปิด-ปิด Dropdown
  const [isPrivateOpen, setIsPrivateOpen] = useState(true)
  const [isGroupsOpen, setIsGroupsOpen] = useState(true)

  return (
    <>
      <div
        className={`sidebar-overlay ${isOpen ? 'active' : ''}`}
        onClick={onClose}
      />
      <aside className={`sidebar ${isOpen ? 'active' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">🤖</div>
            <div>
              <div className="logo-title">SOTUS Engineering LINE</div>
              {/* <div className="logo-sub">ผู้ช่วยจัดการ line</div> */}
            </div>
            {/* Close button for mobile */}
            <button className="sidebar-close-btn" onClick={onClose}>×</button>
          </div>

          <div className="controls-section">
            <div className="date-select-wrapper">
              <label htmlFor="date-select" className="input-label">📅 เลือกวันที่ {loadingDates ? '(Loading...)' : ''}</label>
              <select
                id="date-select"
                className="date-dropdown"
                value={selectedDate}
                onChange={(e) => onSelectDate(e.target.value)}
                disabled={loadingDates}
              >
                {dates.map(d => (
                  <option key={d} value={d}>
                    {formatDateLabel(d)} ({d.slice(5)})
                  </option>
                ))}
              </select>
            </div>

            <button className="btn-summarize-day" onClick={onSummarizeDay}>
              ✨ สรุปภาพรวมทั้งวัน
            </button>
          </div>
        </div>

        <div className="sidebar-content">
          {/* ✅ Dropdown แชทส่วนตัว */}

          <div className={`section ${isPrivateOpen ? 'is-open' : ''}`}>
            <div
              className="section-header-clickable"
              onClick={() => setIsPrivateOpen(!isPrivateOpen)}
            >
              <span className="section-title">💬 แชทส่วนตัว ({privateChats.length})</span>
              <span className="chevron">{isPrivateOpen ? '▼' : '▶'}</span>
            </div>

            {isPrivateOpen && (
              <div className="group-list">
                {privateChats.length === 0 ? (
                  <div className="empty-groups">ยังไม่มีแชทส่วนตัว</div>
                ) : (
                  privateChats.map(g => (
                    <button
                      key={g.groupId}
                      className={`group-btn ${selectedGroup === g.groupId ? 'active' : ''}`}
                      onClick={() => onSelectGroup(g.groupId)}
                    >
                      <div className="group-avatar" style={{ background: getColor(g.groupName) }}>
                        👤
                      </div>
                      <span className="group-name">{g.groupName}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>


          {/* ✅ Dropdown กลุ่ม */}
          <div className={`section ${isGroupsOpen ? 'is-open' : ''}`}>
            <div
              className="section-header-clickable"
              onClick={() => setIsGroupsOpen(!isGroupsOpen)}
            >
              <span className="section-title">👥 กลุ่ม ({realGroups.length})</span>
              <span className="chevron">{isGroupsOpen ? '▼' : '▶'}</span>
            </div>

            {isGroupsOpen && (
              <div className="group-list">
                {realGroups.length === 0 ? (
                  <div className="empty-groups">ยังไม่มีกลุ่ม</div>
                ) : (
                  realGroups.map(g => (
                    <button
                      key={g.groupId}
                      className={`group-btn ${selectedGroup === g.groupId ? 'active' : ''}`}
                      onClick={() => onSelectGroup(g.groupId)}
                    >
                      <div className="group-avatar" style={{ background: getColor(g.groupName) }}>
                        {getInitials(g.groupName)}
                      </div>
                      <span className="group-name">{g.groupName}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}