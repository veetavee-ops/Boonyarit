import { useEffect, useState } from 'react'
import { fetchDataBrowserDiagram, fetchDataBrowserRows, fetchDataBrowserSchema } from '../api/dataBrowser'
import ErDiagram from './ErDiagram'
import '../pages/DriveFilesPage.css'
import '../pages/PaymentVerificationPage.css'
import './DataBrowserPage.css'

function formatCell(value) {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const RELATION_LABEL = {
  BelongsTo: 'อยู่ใน (belongsTo)',
  HasMany: 'มีหลายรายการ (hasMany)',
  HasOne: 'มีหนึ่งรายการ (hasOne)',
  BelongsToMany: 'ผูกหลายต่อหลาย (belongsToMany)',
}

export default function DataBrowserPage({ onClose }) {
  const [diagram, setDiagram] = useState({ tables: [], edges: [] })
  const [diagramLoading, setDiagramLoading] = useState(true)
  const [selected, setSelected] = useState(null) // { key, label }
  const [viewingData, setViewingData] = useState(false)

  const [schema, setSchema] = useState(null) // { columns, relations }
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schemaError, setSchemaError] = useState('')

  const [columns, setColumns] = useState([])
  const [rows, setRows] = useState([])
  const [rowsLoading, setRowsLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchDataBrowserDiagram()
      .then(setDiagram)
      .catch(() => setDiagram({ tables: [], edges: [] }))
      .finally(() => setDiagramLoading(false))
  }, [])

  useEffect(() => {
    if (!selected) return
    setSchemaLoading(true)
    setSchemaError('')
    fetchDataBrowserSchema(selected.key)
      .then(setSchema)
      .catch((e) => setSchemaError(e.response?.data?.error || e.message))
      .finally(() => setSchemaLoading(false))
  }, [selected])

  useEffect(() => {
    if (!selected || !viewingData) return
    setRowsLoading(true)
    setError('')
    fetchDataBrowserRows(selected.key, { page })
      .then((data) => {
        setColumns(data.columns || [])
        setRows(data.rows || [])
        setTotal(data.total || 0)
        setPageSize(data.pageSize || 50)
      })
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setRowsLoading(false))
  }, [selected, viewingData, page])

  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'Escape') return
      goBack()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, viewingData, onClose])

  const openTable = (t) => {
    setSelected(t)
    setViewingData(false)
    setSchema(null)
    setPage(1)
    setColumns([])
    setRows([])
  }

  const openData = () => {
    setViewingData(true)
    setPage(1)
  }

  const goBack = () => {
    if (viewingData) { setViewingData(false); return }
    if (selected) { setSelected(null); return }
    onClose?.()
  }

  const totalPages = Math.max(Math.ceil(total / pageSize), 1)

  const headerTitle = selected
    ? `${selected.label}${viewingData ? ' — ข้อมูล' : ' — โครงสร้าง'}`
    : 'ดูตาราง DB'

  return (
    <div className="drive-modal-overlay" onClick={goBack}>
      <div className="drive-page" onClick={(e) => e.stopPropagation()}>
        <div className="app-header">
          <div className="header-left-controls">
            <button className="menu-btn back-btn" onClick={goBack}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
          <div className="header-brand">
            <span className="header-brand-name">{headerTitle}</span>
          </div>
          <div className="header-right-spacer" />
        </div>

        {!selected ? (
          diagramLoading ? (
            <div className="drive-body"><div className="drive-empty"><div className="spinner" /><p>กำลังโหลด...</p></div></div>
          ) : diagram.tables.length === 0 ? (
            <div className="drive-body"><div className="drive-empty"><p>ไม่พบตาราง</p></div></div>
          ) : (
            <ErDiagram tables={diagram.tables} edges={diagram.edges} onSelectTable={openTable} />
          )
        ) : !viewingData ? (
          // ── โครงสร้างตาราง: field / primary key / foreign key / ความสัมพันธ์ ──
          <div className="drive-body">
            {schemaLoading ? (
              <div className="drive-empty"><div className="spinner" /><p>กำลังโหลด...</p></div>
            ) : schemaError ? (
              <div className="drive-empty"><p>{schemaError}</p></div>
            ) : (
              <>
                <div className="drive-toolbar">
                  <button className="btn-confirm-delete" onClick={openData}>
                    เปิดดูข้อมูลในตาราง →
                  </button>
                </div>

                <h3 className="pv-section-title">ฟิลด์ (Fields)</h3>
                <div className="drive-table-wrap">
                  <table className="drive-table">
                    <thead>
                      <tr>
                        <th>ชื่อฟิลด์</th>
                        <th>ชนิดข้อมูล</th>
                        <th>Key</th>
                        <th>Nullable</th>
                        <th>อ้างอิงตาราง (FK)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(schema?.columns || []).map((c) => (
                        <tr key={c.name}>
                          <td>
                            {c.name}
                            {c.sensitive && <span className="db-badge db-badge--sensitive" title="ข้อมูลอ่อนไหว — ถูกซ่อนตอนดูข้อมูลจริง">ซ่อนข้อมูล</span>}
                          </td>
                          <td className="cell-muted">{c.type}</td>
                          <td>
                            {c.primaryKey && <span className="db-badge db-badge--pk">PK</span>}
                            {c.isForeignKey && <span className="db-badge db-badge--fk">FK</span>}
                          </td>
                          <td className="cell-muted">{c.allowNull ? 'ว่างได้' : 'ห้ามว่าง'}</td>
                          <td className="cell-muted">{c.references || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h3 className="pv-section-title">ความสัมพันธ์ (Relations)</h3>
                <div className="drive-table-wrap">
                  {(schema?.relations || []).length === 0 ? (
                    <div className="drive-empty"><p>ตารางนี้ไม่มีความสัมพันธ์กับตารางอื่น</p></div>
                  ) : (
                    <table className="drive-table">
                      <thead>
                        <tr>
                          <th>ประเภท</th>
                          <th>ตารางปลายทาง</th>
                          <th>ผ่านฟิลด์</th>
                          <th>ชื่อเรียก (as)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(schema?.relations || []).map((r, i) => (
                          <tr key={i}>
                            <td>{RELATION_LABEL[r.type] || r.type}</td>
                            <td>{r.target}</td>
                            <td className="cell-muted">{r.foreignKey}</td>
                            <td className="cell-muted">{r.as || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          // ── ข้อมูลจริงในตาราง ──
          <div className="drive-body">
            <div className="drive-toolbar">
              <button className="btn-cancel" onClick={() => setViewingData(false)}>← โครงสร้างตาราง</button>
              <span className="drive-count">{total.toLocaleString('th-TH')} แถว — หน้า {page}/{totalPages}</span>
            </div>

            <div className="drive-table-wrap">
              {rowsLoading ? (
                <div className="drive-empty"><div className="spinner" /><p>กำลังโหลด...</p></div>
              ) : error ? (
                <div className="drive-empty"><p>{error}</p></div>
              ) : rows.length === 0 ? (
                <div className="drive-empty"><p>ตารางนี้ยังไม่มีข้อมูล</p></div>
              ) : (
                <table className="drive-table">
                  <thead>
                    <tr>
                      {columns.map((c) => <th key={c}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i}>
                        {columns.map((c) => (
                          <td key={c} className="cell-muted">{formatCell(row[c])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {totalPages > 1 && (
              <div className="pv-note-row">
                <button className="btn-cancel" onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={page <= 1 || rowsLoading}>
                  ← ก่อนหน้า
                </button>
                <button className="btn-cancel" onClick={() => setPage((p) => Math.min(p + 1, totalPages))} disabled={page >= totalPages || rowsLoading}>
                  ถัดไป →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
