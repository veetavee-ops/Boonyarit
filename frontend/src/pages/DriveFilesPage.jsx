import { useEffect, useState, useMemo } from 'react'
import axios from 'axios'
import './DriveFilesPage.css'

const API_BASE = import.meta.env.VITE_API_URL || ''

function formatFileSize(bytes) {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function toDateStr(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function formatDateLabel(dateStr) {
  return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function getFileCategory(f) {
  if (f.messageType === 'image') return 'image'
  const ext = (f.fileName || '').split('.').pop().toLowerCase()
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'document'
  return 'other'
}

const TABS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'image', label: 'รูปภาพ' },
  { key: 'document', label: 'เอกสาร' },
  { key: 'other', label: 'อื่นๆ' },
]

function openPopup(url) {
  window.open(url, '_blank', 'width=1200,height=800,noopener,noreferrer')
}

function FileIcon({ f }) {
  if (f.messageType === 'image') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style={{ color: '#1a73e8', flexShrink: 0 }}>
        <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style={{ color: '#F97316', flexShrink: 0 }}>
      <path d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z" />
    </svg>
  )
}

export default function DriveFilesPage({ onClose }) {
  const [files, setFiles] = useState([])
  const [groups, setGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [driveRootUrl, setDriveRootUrl] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    axios.get(`${API_BASE}/api/groups`, { withCredentials: true })
      .then(r => setGroups(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
    axios.get(`${API_BASE}/api/groups/drive-root`, { withCredentials: true })
      .then(r => setDriveRootUrl(r.data.url))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    setSelectedDate('')
    setSelectedIds(new Set())
    const params = selectedGroup ? `?groupId=${selectedGroup}` : ''
    axios.get(`${API_BASE}/api/messages/drive-files${params}`, { withCredentials: true })
      .then(r => setFiles(r.data))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false))
  }, [selectedGroup])

  // ESC ปิด modal (ถ้าไม่มี confirm เปิดอยู่)
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (confirmOpen) setConfirmOpen(false)
        else onClose?.()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [confirmOpen, onClose])

  const availableDates = useMemo(() => {
    const set = new Set(files.map(f => toDateStr(f.timestamp)))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [files])

  useEffect(() => {
    if (selectedDate && !availableDates.includes(selectedDate)) setSelectedDate('')
  }, [availableDates])

  const baseFiles = useMemo(() => files
    .filter(f => !selectedDate || toDateStr(f.timestamp) === selectedDate)
    .filter(f => !searchQuery.trim() || (f.fileName || '').toLowerCase().includes(searchQuery.trim().toLowerCase()))
  , [files, selectedDate, searchQuery])

  const filteredFiles = useMemo(() =>
    activeTab === 'all' ? baseFiles : baseFiles.filter(f => getFileCategory(f) === activeTab)
  , [baseFiles, activeTab])

  const tabCounts = useMemo(() => ({
    all: baseFiles.length,
    image: baseFiles.filter(f => getFileCategory(f) === 'image').length,
    document: baseFiles.filter(f => getFileCategory(f) === 'document').length,
    other: baseFiles.filter(f => getFileCategory(f) === 'other').length,
  }), [baseFiles])

  const allSelected = filteredFiles.length > 0 && filteredFiles.every(f => selectedIds.has(f.id))

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allSelected) filteredFiles.forEach(f => next.delete(f.id))
      else filteredFiles.forEach(f => next.add(f.id))
      return next
    })
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await axios.delete(`${API_BASE}/api/messages/drive-files`, {
        data: { ids: [...selectedIds] },
        withCredentials: true,
      })
      setFiles(prev => prev.filter(f => !selectedIds.has(f.id)))
      setSelectedIds(new Set())
      setConfirmOpen(false)
    } catch (e) {
      alert('เกิดข้อผิดพลาด: ' + (e.response?.data?.error || e.message))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="drive-modal-overlay" onClick={onClose}>
      <div className="drive-page" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="app-header">
          <div className="header-left-controls">
            <button className="menu-btn back-btn" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
          <div className="header-brand">
            <span className="header-brand-icon">
              <svg viewBox="0 0 24 24" fill="white" width="18" height="18">
                <path d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z" />
              </svg>
            </span>
            <span className="header-brand-name">สารบัญไฟล์ Google Drive</span>
          </div>
          <div className="header-right-spacer" />
        </div>

        <div className="drive-body">
          {/* Toolbar */}
          <div className="drive-toolbar">
            <select className="drive-group-select" value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
              <option value="">ทุกกลุ่ม</option>
              {groups.map(g => (
                <option key={g.groupId} value={g.groupId}>
                  {g.isPrivate ? `💬 ${g.groupName}` : g.groupName}
                </option>
              ))}
            </select>

            <select
              className="drive-group-select"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              disabled={availableDates.length === 0}
            >
              <option value="">ทุกวัน ({availableDates.length} วัน)</option>
              {availableDates.map(d => <option key={d} value={d}>{formatDateLabel(d)}</option>)}
            </select>

            <input
              className="drive-search-input"
              type="text"
              placeholder="ค้นหาชื่อไฟล์..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />

            <span className="drive-count">{filteredFiles.length} ไฟล์</span>

            {driveRootUrl && (
              <button className="drive-root-btn" onClick={() => openPopup(driveRootUrl)}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                  <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
                </svg>
                เปิด Google Drive
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="drive-tabs-row">
            <div className="drive-tabs">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  className={`drive-tab${activeTab === tab.key ? ' active' : ''}`}
                  onClick={() => { setActiveTab(tab.key); setSelectedIds(new Set()) }}
                >
                  {tab.label}
                  <span className="drive-tab-count">{tabCounts[tab.key]}</span>
                </button>
              ))}
            </div>

            {selectedIds.size > 0 && (
              <button className="drive-delete-btn" onClick={() => setConfirmOpen(true)}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </svg>
                ลบ {selectedIds.size} รายการ
              </button>
            )}
          </div>

          {/* Table */}
          <div className="drive-table-wrap">
            {loading ? (
              <div className="drive-empty">
                <div className="spinner" />
                <p>กำลังโหลด...</p>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="drive-empty">
                <svg viewBox="0 0 24 24" fill="currentColor" width="40" height="40" style={{ color: '#c5ced6' }}>
                  <path d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z" />
                </svg>
                <p>ไม่มีไฟล์</p>
              </div>
            ) : (
              <table className="drive-table">
                <thead>
                  <tr>
                    <th className="col-check">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                    </th>
                    <th>ชื่อไฟล์</th>
                    <th>กลุ่ม</th>
                    <th>ส่งโดย</th>
                    <th>ขนาด</th>
                    <th>วันที่</th>
                    <th>ลิงก์</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map(f => (
                    <tr key={f.id} className={selectedIds.has(f.id) ? 'row-selected' : ''} onClick={() => toggleSelect(f.id)}>
                      <td className="col-check" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(f.id)} onChange={() => toggleSelect(f.id)} />
                      </td>
                      <td>
                        <span className="file-name-cell">
                          <FileIcon f={f} />
                          {f.fileName}
                        </span>
                      </td>
                      <td>{f.groupName || '-'}</td>
                      <td>{f.uploadedBy || '-'}</td>
                      <td className="cell-muted">{formatFileSize(f.fileSize)}</td>
                      <td className="cell-muted">
                        {new Date(f.timestamp).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="cell-center" onClick={e => e.stopPropagation()}>
                        {f.driveUrl
                          ? <button className="drive-link" onClick={() => openPopup(f.driveUrl)}>เปิด ↗</button>
                          : <span className="cell-muted">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Confirm Delete Modal */}
        {confirmOpen && (
          <div className="drive-overlay" onClick={() => setConfirmOpen(false)}>
            <div className="drive-confirm" onClick={e => e.stopPropagation()}>
              <div className="drive-confirm-icon">🗑️</div>
              <h3>ยืนยันการลบ</h3>
              <p>ลบ <strong>{selectedIds.size} รายการ</strong> ออกจาก Drive + GCS + สารบัญ?</p>
              <p className="drive-confirm-warn">ไม่สามารถกู้คืนได้</p>
              <div className="drive-confirm-actions">
                <button className="btn-cancel" autoFocus onClick={() => setConfirmOpen(false)}>
                  ยกเลิก
                </button>
                <button className="btn-confirm-delete" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'กำลังลบ...' : 'ลบเลย'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
