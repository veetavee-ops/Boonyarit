import { useEffect, useState } from 'react'
import { fetchPaymentVerifications, fetchPaymentVerificationDetail, correctPaymentVerification, fetchLedgerAccounts, fetchAccountLedger } from '../api/paymentVerification'
import { fetchGroups } from '../api/messages'
import '../pages/DriveFilesPage.css'
import './PaymentVerificationPage.css'

const STATUS_LABEL = {
  matched: { text: '✅ ตรงกัน', className: 'pv-status pv-status--ok' },
  has_mismatch: { text: '⚠️ ไม่ตรง', className: 'pv-status pv-status--warn' },
  corrected: { text: '✏️ แก้ไขแล้ว', className: 'pv-status pv-status--corrected' },
}

const LEDGER_PAGE_SIZE = 50

function formatMoney(n) {
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function totalOf(items) {
  return items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0)
}

function formatDateTime(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function PaymentVerificationPage({ onClose }) {
  const [viewMode, setViewMode] = useState('submissions') // 'submissions' | 'accounts'

  // ── รายการตรวจสอบ (ของเดิม) ──────────────────────────────
  const [records, setRecords] = useState([])
  const [groups, setGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState('')
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editReportItems, setEditReportItems] = useState([])
  const [editBankItems, setEditBankItems] = useState([])
  const [correctionNote, setCorrectionNote] = useState('')
  const [saving, setSaving] = useState(false)

  // ── บัญชี & เงินคงเหลือ (ใหม่) ────────────────────────────
  const [accounts, setAccounts] = useState([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [selectedAccount, setSelectedAccount] = useState(null) // { groupId, groupName }
  const [ledgerEntries, setLedgerEntries] = useState([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerLoadingMore, setLedgerLoadingMore] = useState(false)
  const [ledgerHasMore, setLedgerHasMore] = useState(true)

  useEffect(() => {
    fetchGroups().then(g => setGroups(Array.isArray(g) ? g.filter(x => !x.isPrivate) : [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (viewMode !== 'submissions') return
    setLoading(true)
    fetchPaymentVerifications({ groupId: selectedGroup || undefined })
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [selectedGroup, viewMode])

  useEffect(() => {
    if (viewMode !== 'accounts') return
    setAccountsLoading(true)
    fetchLedgerAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]))
      .finally(() => setAccountsLoading(false))
  }, [viewMode])

  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'Escape') return
      if (detail) { setDetail(null); return }
      if (selectedAccount) { setSelectedAccount(null); return }
      onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [detail, selectedAccount, onClose])

  const openDetail = async (id) => {
    setDetailLoading(true)
    try {
      const d = await fetchPaymentVerificationDetail(id)
      setDetail(d)
      setEditReportItems(d.reportItems || [])
      setEditBankItems(d.bankItems || [])
      setCorrectionNote(d.correctionNote || '')
    } catch (e) {
      alert('โหลดรายละเอียดไม่สำเร็จ: ' + (e.response?.data?.error || e.message))
    } finally {
      setDetailLoading(false)
    }
  }

  const updateReportField = (idx, field, value) => {
    setEditReportItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }
  const updateBankField = (idx, field, value) => {
    setEditBankItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  const handleSaveCorrection = async () => {
    setSaving(true)
    try {
      const updated = await correctPaymentVerification(detail.id, {
        reportItems: editReportItems,
        bankItems: editBankItems,
        correctionNote,
      })
      setRecords(prev => prev.map(r => r.id === updated.id ? { ...r, overallStatus: updated.overallStatus } : r))
      setDetail(updated)
      alert('บันทึกการแก้ไขแล้ว')
    } catch (e) {
      alert('บันทึกไม่สำเร็จ: ' + (e.response?.data?.error || e.message))
    } finally {
      setSaving(false)
    }
  }

  // ── บัญชี & เงินคงเหลือ handlers ──────────────────────────
  const openAccountLedger = async (account) => {
    setSelectedAccount(account)
    setLedgerEntries([])
    setLedgerHasMore(true)
    setLedgerLoading(true)
    try {
      const rows = await fetchAccountLedger(account.groupId, { limit: LEDGER_PAGE_SIZE })
      setLedgerEntries(rows)
      setLedgerHasMore(rows.length === LEDGER_PAGE_SIZE)
    } catch (e) {
      alert('โหลด ledger ไม่สำเร็จ: ' + (e.response?.data?.error || e.message))
    } finally {
      setLedgerLoading(false)
    }
  }

  const loadMoreLedger = async () => {
    if (!selectedAccount || ledgerEntries.length === 0) return
    setLedgerLoadingMore(true)
    try {
      const cursor = ledgerEntries[ledgerEntries.length - 1].occurredAt
      const rows = await fetchAccountLedger(selectedAccount.groupId, { limit: LEDGER_PAGE_SIZE, before: cursor })
      setLedgerEntries(prev => [...prev, ...rows])
      setLedgerHasMore(rows.length === LEDGER_PAGE_SIZE)
    } catch (e) {
      alert('โหลดเพิ่มไม่สำเร็จ: ' + (e.response?.data?.error || e.message))
    } finally {
      setLedgerLoadingMore(false)
    }
  }

  const goBack = () => {
    if (detail) { setDetail(null); return }
    if (selectedAccount) { setSelectedAccount(null); return }
    onClose?.()
  }

  const headerTitle = detail
    ? 'รายละเอียดการตรวจสอบ'
    : selectedAccount
    ? `บัญชี: ${selectedAccount.groupName || selectedAccount.groupId}`
    : 'ตรวจสอบการโอน-ตั้งเบิก'

  return (
    <div className="drive-modal-overlay" onClick={goBack}>
      <div className="drive-page" onClick={e => e.stopPropagation()}>
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

        {!detail && !selectedAccount && (
          <div className="drive-tabs-row" style={{ padding: '14px 20px 0' }}>
            <div className="drive-tabs">
              <button className={`drive-tab${viewMode === 'submissions' ? ' active' : ''}`} onClick={() => setViewMode('submissions')}>
                รายการตรวจสอบ
              </button>
              <button className={`drive-tab${viewMode === 'accounts' ? ' active' : ''}`} onClick={() => setViewMode('accounts')}>
                บัญชี & เงินคงเหลือ
              </button>
            </div>
          </div>
        )}

        {detail ? (
          detailLoading ? (
            <div className="drive-empty"><div className="spinner" /><p>กำลังโหลด...</p></div>
          ) : (
          <div className="drive-body pv-detail-body">
            <div className="pv-detail-summary">
              <span className={STATUS_LABEL[detail.overallStatus]?.className || 'pv-status'}>
                {STATUS_LABEL[detail.overallStatus]?.text || detail.overallStatus}
              </span>
              <span className="cell-muted">
                {formatDateTime(detail.submittedAt)}
                {' — '}{detail.group?.groupName}
              </span>
              {detail.endingBalance != null && (
                <span className="cell-muted">ยอดคงเหลือธนาคาร: {formatMoney(detail.endingBalance)} บาท</span>
              )}
            </div>

            {/* ผลจับคู่ */}
            <h3 className="pv-section-title">ผลตรวจสอบ</h3>
            <div className="drive-table-wrap">
              <table className="drive-table">
                <thead>
                  <tr>
                    <th>สถานะ</th>
                    <th>รายการตั้งเบิก</th>
                    <th>รายการโอนจริง</th>
                    <th>หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.matchResults || []).map((m, i) => (
                    <tr key={i} className={m.status !== 'matched' ? 'pv-row-mismatch' : ''}>
                      <td>{m.status === 'matched' ? '✅' : '⚠️'}</td>
                      <td>{m.reportItem ? `${m.reportItem.payee} — ${formatMoney(m.reportItem.amount)} บ.` : '-'}</td>
                      <td>{m.bankItem ? `${m.bankItem.counterName || '(ไม่ทราบชื่อ)'} — ${formatMoney(m.bankItem.amount)} บ.` : '-'}</td>
                      <td className="cell-muted">{m.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* แก้ไขรายการตั้งเบิก */}
            <h3 className="pv-section-title">แก้ไขรายการตั้งเบิก (ถ้า AI อ่านผิด)</h3>
            <div className="drive-table-wrap">
              <table className="drive-table">
                <thead>
                  <tr><th>ผู้รับเงิน</th><th>เลขบัญชี</th><th>ธนาคาร</th><th>ยอด</th><th>รหัสงาน</th></tr>
                </thead>
                <tbody>
                  {editReportItems.map((it, i) => (
                    <tr key={i}>
                      <td><input className="pv-cell-input" value={it.payee || ''} onChange={e => updateReportField(i, 'payee', e.target.value)} /></td>
                      <td><input className="pv-cell-input" value={it.bankAccount || ''} onChange={e => updateReportField(i, 'bankAccount', e.target.value)} /></td>
                      <td><input className="pv-cell-input" value={it.bankName || ''} onChange={e => updateReportField(i, 'bankName', e.target.value)} /></td>
                      <td><input className="pv-cell-input pv-cell-input--num" value={it.amount ?? ''} onChange={e => updateReportField(i, 'amount', e.target.value)} /></td>
                      <td><input className="pv-cell-input" value={it.jobCode || ''} onChange={e => updateReportField(i, 'jobCode', e.target.value)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* แก้ไขรายการธนาคาร */}
            <h3 className="pv-section-title">แก้ไขรายการโอนจริงจากธนาคาร</h3>
            <div className="drive-table-wrap">
              <table className="drive-table">
                <thead>
                  <tr><th>เวลา</th><th>ทิศทาง</th><th>ยอด</th><th>ชื่อ/รายละเอียด</th></tr>
                </thead>
                <tbody>
                  {editBankItems.map((it, i) => (
                    <tr key={i}>
                      <td><input className="pv-cell-input" value={it.time || ''} onChange={e => updateBankField(i, 'time', e.target.value)} /></td>
                      <td>
                        <select className="pv-cell-input" value={it.direction || 'out'} onChange={e => updateBankField(i, 'direction', e.target.value)}>
                          <option value="out">ออก</option>
                          <option value="in">เข้า</option>
                        </select>
                      </td>
                      <td><input className="pv-cell-input pv-cell-input--num" value={it.amount ?? ''} onChange={e => updateBankField(i, 'amount', e.target.value)} /></td>
                      <td><input className="pv-cell-input" value={it.counterName || ''} onChange={e => updateBankField(i, 'counterName', e.target.value)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pv-note-row">
              <textarea
                className="pv-note-input"
                placeholder="หมายเหตุการแก้ไข (ถ้ามี)"
                value={correctionNote}
                onChange={e => setCorrectionNote(e.target.value)}
              />
              <button className="btn-confirm-delete" onClick={handleSaveCorrection} disabled={saving}>
                {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
              </button>
            </div>
          </div>
          )
        ) : viewMode === 'accounts' ? (
          selectedAccount ? (
            <div className="drive-body">
              <div className="drive-table-wrap">
                {ledgerLoading ? (
                  <div className="drive-empty"><div className="spinner" /><p>กำลังโหลด...</p></div>
                ) : ledgerEntries.length === 0 ? (
                  <div className="drive-empty"><p>บัญชีนี้ยังไม่มีรายการ</p></div>
                ) : (
                  <table className="drive-table">
                    <thead>
                      <tr>
                        <th>วันที่/เวลา</th>
                        <th>ทิศทาง</th>
                        <th>ยอด</th>
                        <th>ชื่อ/รายละเอียด</th>
                        <th>คงเหลือ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="cell-muted">{formatDateTime(entry.occurredAt)}</td>
                          <td>
                            <span className={entry.direction === 'in' ? 'pv-status pv-status--ok' : 'pv-status pv-status--warn'}>
                              {entry.direction === 'in' ? 'เข้า' : 'ออก'}
                            </span>
                          </td>
                          <td className={entry.direction === 'in' ? 'pv-amount pv-amount--in' : 'pv-amount pv-amount--out'}>
                            {entry.direction === 'in' ? '+' : '-'}{formatMoney(entry.amount)}
                          </td>
                          <td>{entry.counterName || '(ไม่ทราบชื่อ)'}</td>
                          <td className="cell-muted">{entry.runningBalance != null ? formatMoney(entry.runningBalance) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {ledgerHasMore && ledgerEntries.length > 0 && (
                <button className="btn-cancel pv-load-more" onClick={loadMoreLedger} disabled={ledgerLoadingMore}>
                  {ledgerLoadingMore ? 'กำลังโหลด...' : 'โหลดเพิ่ม'}
                </button>
              )}
            </div>
          ) : (
            <div className="drive-body">
              {accountsLoading ? (
                <div className="drive-empty"><div className="spinner" /><p>กำลังโหลด...</p></div>
              ) : accounts.length === 0 ? (
                <div className="drive-empty"><p>ยังไม่มีกลุ่มที่เปิดใช้ฟีเจอร์ตรวจสอบการโอน-ตั้งเบิก</p></div>
              ) : (
                <div className="pv-account-grid">
                  {accounts.map((acc) => (
                    <div key={acc.groupId} className="pv-account-card" onClick={() => openAccountLedger(acc)}>
                      <div className="pv-account-name">{acc.groupName || acc.groupId}</div>
                      <div className="pv-account-balance">
                        {acc.latestBalance != null ? `${formatMoney(acc.latestBalance)} บาท` : 'ยังไม่มีข้อมูล'}
                      </div>
                      <div className="pv-account-meta">
                        <span className="pv-amount pv-amount--in">เข้า {formatMoney(acc.totalIn)}</span>
                        <span className="pv-amount pv-amount--out">ออก {formatMoney(acc.totalOut)}</span>
                      </div>
                      <div className="cell-muted pv-account-updated">
                        {acc.latestSubmittedAt ? `อัปเดตล่าสุด ${formatDateTime(acc.latestSubmittedAt)}` : 'ยังไม่มีรายการ'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        ) : (
          <div className="drive-body">
            <div className="drive-toolbar">
              <select className="drive-group-select" value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
                <option value="">ทุกกลุ่ม</option>
                {groups.map(g => <option key={g.groupId} value={g.groupId}>{g.groupName}</option>)}
              </select>
              <span className="drive-count">{records.length} รายการ</span>
            </div>

            <div className="drive-table-wrap">
              {loading ? (
                <div className="drive-empty"><div className="spinner" /><p>กำลังโหลด...</p></div>
              ) : records.length === 0 ? (
                <div className="drive-empty"><p>ยังไม่มีรายการตรวจสอบ</p></div>
              ) : (
                <table className="drive-table">
                  <thead>
                    <tr>
                      <th>วันที่</th>
                      <th>กลุ่ม</th>
                      <th>สถานะ</th>
                      <th>ยอดรวม</th>
                      <th>รายการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(r => (
                      <tr key={r.id} onClick={() => openDetail(r.id)} style={{ cursor: 'pointer' }}>
                        <td className="cell-muted">{formatDateTime(r.submittedAt)}</td>
                        <td>{r.group?.groupName || '-'}</td>
                        <td><span className={STATUS_LABEL[r.overallStatus]?.className || 'pv-status'}>{STATUS_LABEL[r.overallStatus]?.text || r.overallStatus}</span></td>
                        <td>{formatMoney(totalOf(r.reportItems || []))} บาท</td>
                        <td className="cell-muted">{(r.reportItems || []).length} รายการ</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
