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

export default function DriveFilesPage() {
  const [files, setFiles] = useState([])
  const [groups, setGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [driveRootUrl, setDriveRootUrl] = useState(null)

  useEffect(() => {
    axios.get(`${API_BASE}/api/groups`, { withCredentials: true })
      .then(r => setGroups(Array.isArray(r.data) ? r.data.filter(g => !g.isPrivate) : []))
      .catch(() => {})
    axios.get(`${API_BASE}/api/groups/drive-root`, { withCredentials: true })
      .then(r => setDriveRootUrl(r.data.url))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    setSelectedDate('')
    const params = selectedGroup ? `?groupId=${selectedGroup}` : ''
    axios.get(`${API_BASE}/api/messages/drive-files${params}`, { withCredentials: true })
      .then(r => setFiles(r.data))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false))
  }, [selectedGroup])

  // derive unique dates from files
  const availableDates = useMemo(() => {
    const set = new Set(files.map(f => toDateStr(f.timestamp)))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [files])

  // reset selectedDate if it's no longer available
  useEffect(() => {
    if (selectedDate && !availableDates.includes(selectedDate)) {
      setSelectedDate('')
    }
  }, [availableDates])

  const filteredFiles = selectedDate
    ? files.filter(f => toDateStr(f.timestamp) === selectedDate)
    : files

  return (
    <div className="drive-page">
      <div className="app-header">
        <div className="header-left-controls">
          <button className="menu-btn back-btn" onClick={() => window.location.href = '/'}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
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
        <div className="drive-toolbar">
          <select
            className="drive-group-select"
            value={selectedGroup}
            onChange={e => setSelectedGroup(e.target.value)}
          >
            <option value="">ทุกกลุ่ม</option>
            {groups.map(g => (
              <option key={g.groupId} value={g.groupId}>{g.groupName}</option>
            ))}
          </select>

          <select
            className="drive-group-select"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            disabled={availableDates.length === 0}
          >
            <option value="">ทุกวัน ({availableDates.length} วัน)</option>
            {availableDates.map(d => (
              <option key={d} value={d}>{formatDateLabel(d)}</option>
            ))}
          </select>

          <span className="drive-count">{filteredFiles.length} ไฟล์</span>

          {driveRootUrl && (
            <a href={driveRootUrl} target="_blank" rel="noreferrer" className="drive-root-btn">
              <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
              </svg>
              เปิด Google Drive
            </a>
          )}
        </div>

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
                  <tr key={f.id}>
                    <td>
                      <span className="file-name-cell">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style={{ color: '#06C755', flexShrink: 0 }}>
                          <path d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z" />
                        </svg>
                        {f.fileName}
                      </span>
                    </td>
                    <td>{f.groupName || '-'}</td>
                    <td>{f.uploadedBy || '-'}</td>
                    <td className="cell-muted">{formatFileSize(f.fileSize)}</td>
                    <td className="cell-muted">
                      {new Date(f.timestamp).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="cell-center">
                      <a href={f.driveUrl} target="_blank" rel="noreferrer" className="drive-link">
                        เปิด ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
