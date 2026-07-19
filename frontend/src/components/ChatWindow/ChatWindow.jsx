import { useEffect, useRef, useState } from 'react'
import { getInitials, getColor, scrollToAndHighlightMessage } from '../../utils/helpers'
import MessageBubble from '../MessageBubble/MessageBubble'
import MediaGallery from '../MediaGallery/MediaGallery'
import { fetchImportantMessages } from '../../api/messages'
import { fetchLedgerBalanceAccounts } from '../../api/ledgerBalance'
import './ChatWindow.css'

// แปลง URL / ลิงก์ markdown [label](url) / **ไฮไลต์** ในข้อความ (คำตอบจาก AI/คำสั่งค้นหา) ให้เป็น
// ของจริง — ลิงก์ path "/app-jump" หรือ "/app-jump-direct" ไม่ใช่หน้าเว็บจริง แต่ดักไว้เปิด popup
// กระโดดไปข้อความ หรือเข้าห้องแชทนั้นตรงๆ แทนการเปิดแท็บใหม่ (ต้องมี onJumpToMessage/
// onJumpToMessageDirect มาจาก props ของ ChatWindow)
function renderLink(url, label, key, onJumpToMessage, onJumpToMessageDirect) {
  let parsed
  try { parsed = new URL(url) } catch { parsed = null }

  if (parsed?.pathname === '/app-jump' && onJumpToMessage) {
    const groupId = parsed.searchParams.get('groupId')
    const messageId = parsed.searchParams.get('messageId')
    const highlight = parsed.searchParams.get('highlight')
    return (
      <a key={key} href={url} className="ai-msg-link"
        onClick={(e) => { e.preventDefault(); onJumpToMessage(groupId, messageId, highlight) }}>
        {label}
      </a>
    )
  }

  if (parsed?.pathname === '/app-jump-direct' && onJumpToMessageDirect) {
    const groupId = parsed.searchParams.get('groupId')
    const messageId = parsed.searchParams.get('messageId')
    const highlight = parsed.searchParams.get('highlight')
    return (
      <a key={key} href={url} className="ai-msg-link"
        onClick={(e) => { e.preventDefault(); onJumpToMessageDirect(groupId, messageId, highlight) }}>
        {label}
      </a>
    )
  }

  return (
    <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="ai-msg-link">
      {label}
    </a>
  )
}

function linkifyText(text, onJumpToMessage, onJumpToMessageDirect) {
  const str = text || ''
  const TOKEN_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|(https?:\/\/[^\s<>"'[\]]+)/g
  const nodes = []
  let lastIndex = 0
  let key = 0
  let m

  while ((m = TOKEN_RE.exec(str)) !== null) {
    if (m.index > lastIndex) nodes.push(str.slice(lastIndex, m.index))

    if (m[1] !== undefined) {
      // markdown link [label](url)
      nodes.push(renderLink(m[2], m[1], key++, onJumpToMessage, onJumpToMessageDirect))
    } else if (m[3] !== undefined) {
      // **ไฮไลต์**
      nodes.push(<mark key={key++} className="search-highlight">{m[3]}</mark>)
    } else if (m[4] !== undefined) {
      // URL เปล่าๆ (ไม่ใช่ markdown link) — ตัดวรรคตอนท้ายออกจาก href แต่โชว์ข้อความเดิม
      const url = m[4].replace(/[.,;:!?'")\]>]+$/, '')
      nodes.push(renderLink(url, m[4], key++, onJumpToMessage, onJumpToMessageDirect))
    }

    lastIndex = TOKEN_RE.lastIndex
  }
  if (lastIndex < str.length) nodes.push(str.slice(lastIndex))

  return nodes
}

function relativeTime(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'เมื่อกี้';
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} วันที่แล้ว`;
  return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

// ตัวเลือก "load ย้อนหลังกี่วัน" — null = โหลดทั้งหมด (ไม่จำกัด)
const DAYS_BACK_OPTIONS = [
  { value: '', label: 'ทั้งหมด' },
  { value: '1', label: '1 วัน' },
  { value: '3', label: '3 วัน' },
  { value: '7', label: '7 วัน' },
  { value: '14', label: '14 วัน' },
  { value: '30', label: '30 วัน' },
  { value: '60', label: '60 วัน' },
  { value: '90', label: '90 วัน' },
];

function highlightText(text, q) {
  if (!q || !text) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + q.length + 60);
  const snippet = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  const rel = idx - start;
  return (
    <>
      {snippet.slice(0, rel + (start > 0 ? 1 : 0))}
      <mark className="search-highlight">{snippet.slice(rel + (start > 0 ? 1 : 0), rel + (start > 0 ? 1 : 0) + q.length)}</mark>
      {snippet.slice(rel + (start > 0 ? 1 : 0) + q.length)}
    </>
  );
}

export default function ChatWindow({
  currentGroup,
  messages,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  search,
  onSearchChange,
  searchResults,
  searching,
  onSelectGroup,
  onToggleImportant,
  onUpdateComment,
  myLineUserId,
  daysBack,
  onDaysBackChange,
  onDeleteMessages,
  groups = [],
  onForwardMessages,
  canSendDirect = false,
  onSendDirectMessage,
  onAskAssistant,
  canTestOcr = false,
  onTestOcr,
  onCheckCommand,
  onJumpToMessage,
  onJumpToMessageDirect,
  scrollToMessageId,
  highlightKeyword,
}) {
  const messagesEndRef = useRef(null)
  const containerRef = useRef(null)
  const prevScrollHeight = useRef(0)
  const scrolledToJumpIdRef = useRef(null)
  const [showGallery, setShowGallery] = useState(false)
  const [showImportant, setShowImportant] = useState(false)
  const [importantMessages, setImportantMessages] = useState([])
  const [importantLoading, setImportantLoading] = useState(false)

  // ── โหมดเลือกข้อความ (ลบเดี่ยว/ลบกลุ่ม) ──
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ── ส่งต่อข้อความที่เลือกไปยังกลุ่ม/DM อื่น ──
  const [forwardOpen, setForwardOpen] = useState(false)
  const [forwardSearch, setForwardSearch] = useState('')
  const [forwardTargetId, setForwardTargetId] = useState(null)
  const [forwarding, setForwarding] = useState(false)
  const [forwardFocused, setForwardFocused] = useState('cancel') // 'cancel' | 'confirm'
  const forwardWasFocusedRef = useRef(false)
  const cancelBtnRef = useRef(null)
  const forwardBtnRef = useRef(null)

  const closeForwardPicker = () => {
    setForwardOpen(false)
    setForwardTargetId(null)
    setForwardSearch('')
    setForwardFocused('cancel')
  }

  const handleForwardMouseDown = () => {
    forwardWasFocusedRef.current = forwardFocused === 'confirm'
  }

  const handleConfirmForward = async () => {
    if (!forwardWasFocusedRef.current) return // คลิกแรก = แค่ set focus ไม่ยิง action
    if (!forwardTargetId || forwarding) return
    setForwarding(true)
    try {
      const result = await onForwardMessages?.([...selectedIds], forwardTargetId)
      alert(
        `ส่งต่อสำเร็จ ${result?.sent || 0} ข้อความ` +
        (result?.failed ? ` (${result.failed} รายการไม่สำเร็จ)` : '')
      )
      closeForwardPicker()
      setSelectedIds(new Set())
      setSelectMode(false)
    } catch (e) {
      alert('ส่งต่อไม่สำเร็จ: ' + e.message)
    } finally {
      setForwarding(false)
    }
  }

  const handleForwardArrowNav = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next = e.target === cancelBtnRef.current ? forwardBtnRef.current : cancelBtnRef.current
    next?.focus()
  }

  // ── พิมพ์ข้อความส่งตรงเข้าห้อง LINE (push) — ไม่บันทึกลงประวัติแชท ──
  const [composeText, setComposeText] = useState('')
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendFocused, setSendFocused] = useState('cancel') // 'cancel' | 'confirm'
  const sendWasFocusedRef = useRef(false)
  const sendCancelBtnRef = useRef(null)
  const sendConfirmBtnRef = useRef(null)

  const closeSendConfirm = () => {
    setSendConfirmOpen(false)
    setSendFocused('cancel')
  }

  // ── คุยกับ AI ผู้ช่วย (DM ปลอม currentGroup?.isAiAssistant) — local เท่านั้น ไม่บันทึกลง DB ──
  const [aiMessages, setAiMessages] = useState([])
  const [aiThinking, setAiThinking] = useState(false)

  // ส่งคำถาม/คำสั่งไปให้ onAskAssistant แล้วต่อ bubble ใน DM — ใช้ร่วมกันทั้งคุยแบบ free-form
  // และปุ่ม "ค้นหาDB" (displayText แยกจาก question จริงที่ส่งไป backend เผื่ออยากโชว์ต่างกัน)
  const askAndAppend = async (question, displayText) => {
    if (!question || aiThinking) return
    setAiMessages((prev) => [...prev, { role: 'user', text: displayText ?? question }])
    setAiThinking(true)
    try {
      const result = await onAskAssistant?.(question)
      setAiMessages((prev) => [...prev, { role: 'ai', text: result?.reply || '(ไม่มีคำตอบ)' }])
    } catch (e) {
      setAiMessages((prev) => [...prev, { role: 'ai', text: '❌ ' + e.message }])
    } finally {
      setAiThinking(false)
    }
  }

  const handleAskSubmit = () => {
    const question = composeText.trim()
    if (!question || aiThinking) return
    setComposeText('')
    askAndAppend(question)
  }

  // ── ปุ่ม "ค้นหาDB" — ค้นทั้งฐานข้อมูล (ต่างจากคุยกับ AI แบบ free-form) ──
  const [dbSearchOpen, setDbSearchOpen] = useState(false)
  const [dbSearchText, setDbSearchText] = useState('')
  const dbSearchInputRef = useRef(null)

  const handleDbSearchToggle = () => {
    setDbSearchOpen((v) => {
      const next = !v
      if (next) { setTimeout(() => dbSearchInputRef.current?.focus(), 0); setOcrTestOpen(false); resetOcrTest() }
      else setDbSearchText('')
      return next
    })
  }

  const handleDbSearchSubmit = () => {
    const keyword = dbSearchText.trim()
    if (!keyword || aiThinking) return
    setDbSearchText('')
    setDbSearchOpen(false)
    askAndAppend(`ค้นหาDB ${keyword}`, `🔍 ค้นหาDB: ${keyword}`)
  }

  const handleDbSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleDbSearchSubmit()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setDbSearchOpen(false)
      setDbSearchText('')
    }
  }

  // ── ปุ่ม "ทดสอบ OCR" — อัปโหลดรูปทดสอบ 3 ฟีเจอร์ OCR (ตรวจสอบการโอน-ตั้งเบิก/สรุปใบเสร็จ/เช็คยอด
  // สมุดบัญชี) โดยไม่ผ่าน LINE และไม่บันทึกลง DB — เรียก pipeline จริงเดียวกับ LINE ผ่าน onTestOcr
  // (ดู App.jsx handleTestOcr) — เช็คยอดสมุดบัญชีอ่านยอดจริงของกลุ่มมาคำนวณ preview (read-only) เท่านั้น ──
  const [ocrTestOpen, setOcrTestOpen] = useState(false)
  const [ocrTestType, setOcrTestType] = useState('payment') // 'payment' | 'receipt' | 'ledger'
  const [ocrTestImages, setOcrTestImages] = useState([])    // [{ dataUrl, name }]
  const ocrFileInputRef = useRef(null)

  // ── โหมดย่อยของ "เช็คยอดสมุดบัญชี" — ต้องเลือกกลุ่ม/บริษัทก่อนเสมอ (ดึงจากกลุ่มที่เปิดธงไว้แล้ว) ──
  const [ocrLedgerMode, setOcrLedgerMode] = useState('slip') // 'slip' (สลิปโอนเงิน 1-2 รูป) | 'book' (เช็คสมุด 1 รูป)
  const [ocrLedgerGroupId, setOcrLedgerGroupId] = useState('')
  const [ocrLedgerAccounts, setOcrLedgerAccounts] = useState([])
  const [ocrLedgerAccountsLoading, setOcrLedgerAccountsLoading] = useState(false)

  const getOcrMaxImages = () => {
    if (ocrTestType === 'payment') return 2
    if (ocrTestType === 'receipt') return 10
    return ocrLedgerMode === 'slip' ? 2 : 1 // ledger
  }

  const resetOcrTest = () => setOcrTestImages([])

  const handleOcrTestToggle = () => {
    setOcrTestOpen((v) => {
      const next = !v
      if (next) { setDbSearchOpen(false); setDbSearchText('') } // เปิดพร้อมกับ ค้นหาDB ไม่ได้
      else resetOcrTest()
      return next
    })
  }

  // โหลดรายชื่อกลุ่มที่เปิดธง "เช็คยอดสมุดบัญชี" ไว้ ตอนสลับมาโหมด ledger ครั้งแรกที่เปิด panel
  useEffect(() => {
    if (!ocrTestOpen || ocrTestType !== 'ledger') return
    setOcrLedgerAccountsLoading(true)
    fetchLedgerBalanceAccounts()
      .then((accounts) => setOcrLedgerAccounts(Array.isArray(accounts) ? accounts : []))
      .catch(() => setOcrLedgerAccounts([]))
      .finally(() => setOcrLedgerAccountsLoading(false))
  }, [ocrTestOpen, ocrTestType])

  // สลับโหมด payment/receipt/ledger ล้างรูปที่เลือกไว้เสมอ เพราะจำนวนรูปที่ต้องการต่างกัน
  const handleOcrTypeChange = (type) => {
    if (type === ocrTestType) return
    setOcrTestType(type)
    resetOcrTest()
  }

  // สลับโหมดย่อย สลิป/สมุด ภายใน ledger ก็ล้างรูปเหมือนกัน (จำนวนรูปที่ต้องการต่างกัน 1-2 ต่อ 1)
  const handleOcrLedgerModeChange = (mode) => {
    if (mode === ocrLedgerMode) return
    setOcrLedgerMode(mode)
    resetOcrTest()
  }

  // ── รับรูปเข้า ocrTestImages ได้ 3 ทาง (ปุ่ม 📎 เลือกไฟล์ / paste / drag-drop) ใช้ pipeline นี้ร่วมกัน ──
  // เช็คทั้ง MIME type และนามสกุลไฟล์ — บาง OS/เบราว์เซอร์ตอนลากไฟล์วางไม่ใส่ f.type มาให้ (เป็น '')
  // เช็คแค่ f.type.startsWith('image/') อย่างเดียวเลยกรองรูปทิ้งหมดในบางเครื่อง
  const isImageFile = (f) => f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(f.name || '')
  const addOcrFiles = (fileList) => {
    const files = Array.from(fileList || []).filter(isImageFile)
    const max = getOcrMaxImages()
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        setOcrTestImages((prev) => prev.length >= max ? prev : [...prev, { dataUrl: reader.result, name: file.name }])
      }
      reader.readAsDataURL(file)
    })
  }

  const handleOcrFilesSelected = (e) => {
    addOcrFiles(e.target.files)
    e.target.value = '' // ให้เลือกไฟล์เดิมซ้ำได้
  }

  // วาง (Ctrl+V) รูปจาก clipboard ได้เลยตอน panel เปิดอยู่ — ดักที่ window เพราะ panel ไม่มีช่อง
  // พิมพ์ให้ focus (เหมือน pattern ESC cascade ด้านล่างที่ดักที่ window เช่นกัน)
  useEffect(() => {
    if (!ocrTestOpen) return
    const onPaste = (e) => {
      const items = Array.from(e.clipboardData?.items || [])
      const files = items.filter((it) => it.kind === 'file').map((it) => it.getAsFile()).filter(Boolean)
      if (files.length > 0) { e.preventDefault(); addOcrFiles(files) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [ocrTestOpen, ocrTestType, ocrLedgerMode])

  // ── ลากไฟล์รูปมาวางได้ทั้งหน้าตอน panel เปิดอยู่ — ดักที่ window เหมือน paste ด้านบน ไม่ใช่แค่
  // div เดียว เพราะถ้าปล่อยเมาส์พลาดขอบ div ไปนิดเดียว เบราว์เซอร์จะ default ไปเปิดรูปเป็นแท็บใหม่
  // แทน (ต้อง preventDefault ทั้ง dragover/drop ระดับ window กันไว้ ไม่งั้นหลุด target ไม่ได้)
  const [ocrDragActive, setOcrDragActive] = useState(false)
  useEffect(() => {
    if (!ocrTestOpen) return
    const onDragOver = (e) => { e.preventDefault(); setOcrDragActive(true) }
    const onDragLeave = (e) => {
      e.preventDefault()
      // dragleave ยิงตอนย้ายผ่าน element ลูกด้วย เช็ค relatedTarget กันกระพริบ — ถ้าออกจากหน้าต่างจริง
      // relatedTarget จะเป็น null
      if (!e.relatedTarget) setOcrDragActive(false)
    }
    const onDrop = (e) => {
      e.preventDefault()
      setOcrDragActive(false)
      addOcrFiles(e.dataTransfer?.files)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [ocrTestOpen, ocrTestType, ocrLedgerMode])

  const handleOcrRemoveImage = (idx) => {
    setOcrTestImages((prev) => prev.filter((_, i) => i !== idx))
  }

  const ocrCountValid = (() => {
    if (ocrTestType === 'payment') return ocrTestImages.length === 2
    if (ocrTestType === 'receipt') return ocrTestImages.length >= 1 && ocrTestImages.length <= 10
    // ledger — ต้องเลือกกลุ่มก่อนเสมอ ไม่งั้นไม่รู้จะอ่านยอดปัจจุบันของใครมาคำนวณ
    if (!ocrLedgerGroupId) return false
    return ocrLedgerMode === 'slip'
      ? ocrTestImages.length >= 1 && ocrTestImages.length <= 2
      : ocrTestImages.length === 1
  })()

  // แปลง (ocrTestType, ocrLedgerMode) เป็น type string ที่ backend /test-ocr เข้าใจ
  const resolveOcrBackendType = () => {
    if (ocrTestType !== 'ledger') return ocrTestType
    return ocrLedgerMode === 'slip' ? 'ledger-slip' : 'ledger-book'
  }

  const handleOcrTestSubmit = async () => {
    if (!ocrCountValid || aiThinking) return
    const typeLabel = ocrTestType === 'payment' ? 'ตรวจสอบการโอน-ตั้งเบิก'
      : ocrTestType === 'receipt' ? 'สรุปใบเสร็จ'
      : ocrLedgerMode === 'slip' ? 'เช็คยอดสมุดบัญชี (สลิปโอนเงิน)' : 'เช็คยอดสมุดบัญชี (เช็คสมุด)'
    const displayText = `🧪 ทดสอบ OCR: ${typeLabel} (${ocrTestImages.length} รูป)`
    const imagesToSend = ocrTestImages.map((img) => img.dataUrl)
    // แนบรูปไปกับ bubble ด้วย (ไม่ใช่แค่ข้อความ) จะได้เห็นว่าทดสอบด้วยรูปไหนไปบ้าง — เป็น local state
    // ล้วนๆ เหมือน aiMessages ทั้งก้อน หายไปเองตอนรีเฟรช/ออกจากห้อง ไม่ได้บันทึกลง DB อยู่แล้ว
    setAiMessages((prev) => [...prev, { role: 'user', text: displayText, images: imagesToSend }])
    setOcrTestOpen(false)
    resetOcrTest()
    setAiThinking(true)
    try {
      const result = await onTestOcr?.(resolveOcrBackendType(), imagesToSend, ocrTestType === 'ledger' ? ocrLedgerGroupId : undefined)
      const modelSuffix = result?.model ? `\n\n🔧 model: ${result.model}` : ''
      setAiMessages((prev) => [...prev, { role: 'ai', text: (result?.reply || '(ไม่มีคำตอบ)') + modelSuffix }])
    } catch (e) {
      setAiMessages((prev) => [...prev, { role: 'ai', text: '❌ ' + e.message }])
    } finally {
      setAiThinking(false)
    }
  }

  // ── คำสั่ง "ค้นหา"/"สรุปเลย" ที่พิมพ์ในห้องแชทจริง — ตอบ local ไม่ push เข้า LINE ไม่บันทึกลง DB ──
  const [localBubbles, setLocalBubbles] = useState([])
  const [checkingCommand, setCheckingCommand] = useState(false)

  const handleComposeSubmit = async () => {
    if (currentGroup?.isAiAssistant) {
      handleAskSubmit()
      return
    }
    const text = composeText.trim()
    if (!text || checkingCommand) return
    setCheckingCommand(true)
    try {
      const result = await onCheckCommand?.(currentGroup?.groupId, text)
      if (result?.isCommand) {
        setComposeText('')
        setLocalBubbles((prev) => [...prev, { role: 'user', text }, { role: 'ai', text: result.reply }])
      } else {
        setSendConfirmOpen(true)
      }
    } catch (e) {
      alert('เช็คคำสั่งไม่สำเร็จ: ' + e.message)
    } finally {
      setCheckingCommand(false)
    }
  }

  const handleComposeKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleComposeSubmit()
      return
    }
    if (e.key === 'Escape') {
      // ESC ตอนกำลังพิมพ์ = ล้างข้อความ + ออกจากช่องพิมพ์ (ไม่ส่งต่อให้ ESC ชั้นอื่นทำงานซ้อน)
      e.preventDefault()
      e.stopPropagation()
      setComposeText('')
      e.currentTarget.blur()
    }
  }

  const handleSendMouseDown = () => {
    sendWasFocusedRef.current = sendFocused === 'confirm'
  }

  const handleConfirmSend = async () => {
    if (!sendWasFocusedRef.current) return // คลิกแรก = แค่ set focus ไม่ยิง action
    if (!composeText.trim() || sending) return
    setSending(true)
    try {
      await onSendDirectMessage?.(currentGroup?.groupId, composeText.trim())
      setComposeText('')
      closeSendConfirm()
    } catch (e) {
      alert('ส่งไม่สำเร็จ: ' + e.message)
    } finally {
      setSending(false)
    }
  }

  const handleSendArrowNav = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next = e.target === sendCancelBtnRef.current ? sendConfirmBtnRef.current : sendCancelBtnRef.current
    next?.focus()
  }

  // ESC ปิดทีละชั้นจากในสุดออกมา: popup ลบ → popup ส่งต่อ → popup ส่งข้อความ → สื่อ → ข้อความสำคัญ
  // → โหมดเลือก → (ไม่เหลืออะไรให้ปิดแล้ว ไม่ทำอะไรต่อ)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      if (confirmDeleteOpen) { if (!deleting) setConfirmDeleteOpen(false); return }
      if (forwardOpen) { if (!forwarding) closeForwardPicker(); return }
      if (sendConfirmOpen) { if (!sending) closeSendConfirm(); return }
      if (dbSearchOpen) { setDbSearchOpen(false); setDbSearchText(''); return }
      if (ocrTestOpen) { setOcrTestOpen(false); resetOcrTest(); return }
      if (showGallery) { setShowGallery(false); return }
      if (showImportant) { setShowImportant(false); return }
      if (selectMode) { setSelectMode(false); setSelectedIds(new Set()); return }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmDeleteOpen, deleting, forwardOpen, forwarding, sendConfirmOpen, sending, dbSearchOpen, ocrTestOpen, showGallery, showImportant, selectMode])

  const toggleSelectMode = () => {
    setSelectMode((v) => !v)
    setSelectedIds(new Set())
  }

  const toggleSelectMessage = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // คลิกขวาที่ข้อความ = เข้าโหมดเลือก + ติ๊กข้อความนั้นให้เลยทันที (ทางลัดไปกดลบ/ส่งต่อต่อ)
  // การเข้าโหมดเลือกทำให้แถบด้านบน/compose bar ด้านล่างโผล่/หาย → ความสูงของพื้นที่ scroll เปลี่ยน
  // เลยต้องชดเชย scrollTop ไม่ให้ข้อความที่เพิ่งคลิกขวาเด้งออกจากตำแหน่งเดิมที่เห็น
  const handleContextMenuSelect = (id, e) => {
    const el = e?.currentTarget
    const rectBefore = el?.getBoundingClientRect()
    setSelectMode(true)
    setSelectedIds((prev) => new Set(prev).add(id))
    if (el && containerRef.current) {
      requestAnimationFrame(() => {
        const rectAfter = el.getBoundingClientRect()
        containerRef.current.scrollTop += rectAfter.top - rectBefore.top
      })
    }
  }

  const handleConfirmDelete = async () => {
    setDeleting(true)
    try {
      await onDeleteMessages?.([...selectedIds])
      setSelectedIds(new Set())
      setConfirmDeleteOpen(false)
      setSelectMode(false)
    } catch (e) {
      alert('ลบไม่สำเร็จ: ' + e.message)
    } finally {
      setDeleting(false)
    }
  }

  const prevGroupRef = useRef(currentGroup?.groupId)
  const prevMessageCountRef = useRef(0)

  // ✅ Auto-scroll to bottom (only on initial load or new message)
  useEffect(() => {
    if (loading || !containerRef.current) return

    const isNewGroup = prevGroupRef.current !== currentGroup?.groupId

    if (isNewGroup) {
      prevScrollHeight.current = 0
      prevGroupRef.current = currentGroup?.groupId
      prevMessageCountRef.current = 0
    }

    // Skip auto-scroll to bottom if we are just loading MORE older messages
    if (prevScrollHeight.current > 0) return

    // แก้ field ของข้อความเดิม (★ สำคัญ, 💬 คอมเมนต์) เปลี่ยน reference ของ messages array แต่จำนวน
    // ข้อความไม่ได้เพิ่มขึ้นจริง — ไม่ควรกระโดดไปล่างสุดถ้าไม่ใช่ข้อความใหม่เข้ามาจริงๆ (เดิม bug: ลบ
    // คอมเมนต์แล้ว scroll วิ่งไปล่างสุดทุกครั้งทั้งที่ user อาจเลื่อนดูข้อความเก่าอยู่)
    const countIncreased = messages.length > prevMessageCountRef.current
    prevMessageCountRef.current = messages.length
    if (!isNewGroup && !countIncreased) return

    // ถ้ามาจากลิงก์ผลค้นหา (กด "เข้าห้องแชทนี้เลย") แล้วยังไม่ได้เลื่อนไปหามัน — ข้าม auto-scroll ลงล่างสุด
    // ไปก่อน ให้ effect แยกด้านล่าง (jump-to-message) จัดการเลื่อน+ไฮไลต์แทน กันเลื่อน 2 ที่ชนกัน
    if (scrollToMessageId && scrolledToJumpIdRef.current !== scrollToMessageId) return

    // ใช้ scrollTop = scrollHeight ตรงๆ เพื่อให้ scroll ถึง bottom เสมอ
    const el = containerRef.current
    el.scrollTop = el.scrollHeight

    // เลื่อนลงไปอีกครั้งเพื่อรองรับรูปภาพที่เพิ่งโหลดเสร็จ (ซึ่งจะดันข้อความขึ้น)
    const t1 = setTimeout(() => { el.scrollTop = el.scrollHeight }, 150)
    const t2 = setTimeout(() => { el.scrollTop = el.scrollHeight }, 500)
    const t3 = setTimeout(() => { el.scrollTop = el.scrollHeight }, 1000)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [messages, loading, currentGroup?.groupId, search, scrollToMessageId])

  // ✅ กระโดดไปข้อความ (มาจากลิงก์ผลค้นหา "เข้าห้องแชทนี้เลย") — แยกเป็น effect ของตัวเองต่างหาก
  // ไม่ผูกกับเงื่อนไข auto-scroll-ลงล่างสุดด้านบน (ซับซ้อนกว่า เสี่ยงโดน guard บล็อกโดยไม่ได้ตั้งใจ)
  // ใช้ scrollToAndHighlightMessage ที่ลองซ้ำเองถ้ายังไม่เจอ element (กันจังหวะสลับกลุ่ม/โหลดข้อมูลช้า)
  // ค้าง highlight ไว้เลย ไม่ลบออกอัตโนมัติ
  useEffect(() => {
    if (loading || !scrollToMessageId || messages.length === 0) return
    if (scrolledToJumpIdRef.current === scrollToMessageId) return

    scrolledToJumpIdRef.current = scrollToMessageId
    scrollToAndHighlightMessage(scrollToMessageId)
  }, [loading, messages, scrollToMessageId])

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
    setShowImportant(false)
    setSelectMode(false)
    setSelectedIds(new Set())
    closeForwardPicker()
    setComposeText('')
    closeSendConfirm()
    setLocalBubbles([])
  }, [currentGroup])

  useEffect(() => {
    if (!showImportant) return
    setImportantLoading(true)
    fetchImportantMessages(currentGroup?.groupId)
      .then(setImportantMessages)
      .finally(() => setImportantLoading(false))
  }, [showImportant, currentGroup?.groupId])

  const handleToggleImportantFilter = () => {
    setShowGallery(false)
    setShowImportant(v => !v)
  }

  const handleToggleImportant = async (messageId) => {
    if (onToggleImportant) {
      const result = await onToggleImportant(messageId)
      if (result && showImportant) {
        if (result.isImportant) {
          // reload important list
          fetchImportantMessages(currentGroup?.groupId).then(setImportantMessages)
        } else {
          setImportantMessages(prev => prev.filter(m => m.messageId !== messageId))
        }
      }
    }
  }

  const isSearching = search.trim().length >= 2
  const filtered = isSearching ? [] : messages

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
          {currentGroup?.pictureUrl ? (
            <img
              className={`group-avatar-lg group-avatar-lg--img${currentGroup.isPrivate ? ' group-avatar-lg--private' : ''}`}
              src={currentGroup.pictureUrl}
              alt={currentGroup.groupName}
            />
          ) : (
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
          )}
          <div className="header-group-info">
            <h1 className="group-title">
              {currentGroup?.groupName || 'เลือกแชท / กลุ่ม'}
            </h1>
            <p className="group-sub">
              {currentGroup?.isAiAssistant
                ? 'ถามได้เลย ไม่บันทึกลงคลังแชท'
                : `${currentGroup?.isPrivate ? 'แชทส่วนตัว' : 'กลุ่ม'} · ${filtered.length} ข้อความ`}
            </p>
          </div>
        </div>

        <div className="header-right">
          {currentGroup && !currentGroup?.isAiAssistant && (
            <>
              <select
                className="days-back-select"
                value={daysBack ?? ''}
                onChange={(e) => onDaysBackChange?.(e.target.value || null)}
                title="โหลดข้อความย้อนหลังกี่วัน"
              >
                {DAYS_BACK_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                className={`btn-media-gallery${selectMode ? ' active' : ''}`}
                onClick={toggleSelectMode}
                title="เลือกข้อความเพื่อลบ"
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                <span className="btn-media-label">เลือก</span>
              </button>
              <button
                className={`btn-media-gallery${showImportant ? ' active' : ''}`}
                onClick={handleToggleImportantFilter}
                title="ข้อความสำคัญ"
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill={showImportant ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span className="btn-media-label">สำคัญ</span>
              </button>
              <button
                className={`btn-media-gallery${showGallery ? ' active' : ''}`}
                onClick={() => { setShowImportant(false); setShowGallery(v => !v); }}
                title="ดูสื่อ ไฟล์ และลิ้งค์"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                </svg>
                <span className="btn-media-label">สื่อ</span>
              </button>
            </>
          )}

          {!currentGroup?.isAiAssistant && (
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
          )}
        </div>
      </header>

      {currentGroup?.isAiAssistant ? (
        <div className="chat-body">
          <div className={`messages ai-assistant-messages${ocrTestOpen && ocrDragActive ? ' drag-active' : ''}`}>
            {aiMessages.length === 0 && (
              <div className="empty">
                <p>คุยกับ AI ผู้ช่วยได้เลย ถามอะไรก็ได้</p>
                <p className="ai-assistant-hint">ต้องการค้นข้อมูลในระบบจริง ใช้ปุ่ม "🔍 ค้นหาDB" ด้านล่างแทน</p>
              </div>
            )}
            {aiMessages.map((m, i) => (
              <div key={i} className={`ai-msg ai-msg--${m.role}`}>
                {m.images?.length > 0 && (
                  <div className="ai-msg-images">
                    {m.images.map((src, j) => <img key={j} src={src} alt={`รูปทดสอบ ${j + 1}`} />)}
                  </div>
                )}
                {linkifyText(m.text, onJumpToMessage, onJumpToMessageDirect)}
              </div>
            ))}
            {aiThinking && <div className="ai-msg ai-msg--ai ai-msg--thinking">กำลังคิด...</div>}
            {ocrTestOpen && ocrTestImages.length === 0 && (
              <div className="ocr-drop-hint">📥 ลากรูปมาวางตรงนี้ได้เลย หรือ Ctrl+V เพื่อวาง</div>
            )}
            {/* พรีวิวรูปที่แนบไว้แล้วแต่ยังไม่กดทดสอบ — โชว์ในกระทู้แชททันทีที่ paste/drop/เลือกไฟล์
                เพื่อให้เห็นชัดว่ารับรูปแล้วจริง ไม่ต้องกดทดสอบก่อนถึงจะเห็น (เดิมเห็นแค่ thumbnail
                เล็กๆ ใน compose bar ด้านล่าง คนมองข้ามได้ง่าย) */}
            {ocrTestOpen && ocrTestImages.length > 0 && (
              <div className="ai-msg ai-msg--user ai-msg--pending">
                <div className="ai-msg-images">
                  {ocrTestImages.map((img, i) => (
                    <div key={i} className="ai-msg-image-pending">
                      <img src={img.dataUrl} alt={img.name} />
                      <button type="button" onClick={() => handleOcrRemoveImage(i)}>×</button>
                    </div>
                  ))}
                </div>
                <span className="ocr-pending-label">
                  แนบแล้ว {ocrTestImages.length}/{getOcrMaxImages()} รูป — กด "ทดสอบ OCR" ด้านล่างเมื่อครบ
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
      <>
      {/* ── แถบตอนกำลังเลือกข้อความ (select mode) ───────────── */}
      {selectMode && (
        <div className="select-mode-bar">
          <span className="select-mode-count">เลือกแล้ว {selectedIds.size} ข้อความ</span>
          <div className="select-mode-actions">
            <button className="btn-cancel" onClick={toggleSelectMode}>ยกเลิก</button>
            <button
              className="btn-forward"
              disabled={selectedIds.size === 0}
              onClick={() => setForwardOpen(true)}
            >
              ส่งต่อ ({selectedIds.size})
            </button>
            <button
              className="btn-confirm-delete"
              disabled={selectedIds.size === 0}
              onClick={() => setConfirmDeleteOpen(true)}
            >
              ลบ ({selectedIds.size})
            </button>
          </div>
        </div>
      )}

      {/* ── Main content area ──────────────────────────────── */}
      <div className="chat-body">
        {showImportant ? (
          <div className="messages" ref={containerRef}>
            {importantLoading ? (
              <div className="empty"><div className="spinner" /><p>กำลังโหลด...</p></div>
            ) : importantMessages.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="52" height="52" opacity="0.3">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </div>
                <p>ยังไม่มีข้อความสำคัญในกลุ่มนี้</p>
              </div>
            ) : (
              importantMessages.map((msg, i) => (
                <MessageBubble
                  key={msg.id || i}
                  msg={msg}
                  prevMsg={importantMessages[i - 1]}
                  allMessages={importantMessages}
                  onToggleImportant={handleToggleImportant}
                  onUpdateComment={onUpdateComment}
                  myLineUserId={myLineUserId}
                />
              ))
            )}
          </div>
        ) : isSearching ? (
          <div className="search-results-panel">
            {searching ? (
              <div className="empty"><div className="spinner" /><p>กำลังค้นหา...</p></div>
            ) : searchResults.length === 0 ? (
              <div className="empty"><p>ไม่พบ "{search}"</p></div>
            ) : (
              <>
                <div className="search-results-count">พบ {searchResults.length} ข้อความ</div>
                {searchResults.map((r, i) => (
                  <div key={r.messageId || i} className="search-result-row" onClick={() => onSelectGroup?.(r.groupId)}>
                    {r.pictureUrl
                      ? <img className="search-result-avatar search-result-avatar--img" src={r.pictureUrl} alt={r.groupName} />
                      : <div className="search-result-avatar" style={{ background: getColor(r.groupName) }}>{getInitials(r.groupName)}</div>
                    }
                    <div className="search-result-body">
                      <div className="search-result-meta">
                        <span className="search-result-group">{r.groupName}</span>
                        <span className="search-result-sender">{r.displayName}</span>
                        <span className="search-result-time">{relativeTime(r.timestamp)}</span>
                      </div>
                      <div className="search-result-text">
                        {r.text
                          ? highlightText(r.text, search.trim())
                          : r.comment
                            ? <span>💬 {highlightText(r.comment, search.trim())}</span>
                            : r.metadata?.fileName
                              ? <span>📎 {highlightText(r.metadata.fileName, search.trim())}</span>
                              : <span style={{ opacity: 0.5 }}>[ไฟล์/รูป]</span>
                        }
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : (
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
              <div key={msg.id || i} style={{ display: 'contents' }}>
                {showDateSep && (
                  <div className="date-separator">
                    <span className="date-separator-label">{msgDate}</span>
                  </div>
                )}
                <MessageBubble
                  msg={msg}
                  prevMsg={filtered[i - 1]}
                  allMessages={messages}
                  onToggleImportant={handleToggleImportant}
                  onUpdateComment={onUpdateComment}
                  myLineUserId={myLineUserId}
                  selectMode={selectMode}
                  selected={selectedIds.has(msg.id)}
                  onToggleSelect={() => toggleSelectMessage(msg.id)}
                  onContextMenuSelect={(e) => handleContextMenuSelect(msg.id, e)}
                  highlightKeyword={msg.id === scrollToMessageId ? highlightKeyword : undefined}
                />
              </div>
            )
          })}

          {localBubbles.length > 0 && (
            <div className="local-bubbles">
              {localBubbles.map((m, i) => (
                <div key={i} className={`ai-msg ai-msg--${m.role} ai-msg--local`}>{linkifyText(m.text, onJumpToMessage, onJumpToMessageDirect)}</div>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
        )}

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
      </>
      )}

      {/* ── กล่องพิมพ์ (ส่งตรงเข้าห้อง LINE หรือถาม AI ผู้ช่วย) ─── */}
      {currentGroup && !selectMode && !showGallery && !showImportant && !isSearching &&
        (canSendDirect || currentGroup?.isAiAssistant) && (
        <div className="compose-bar">
          {currentGroup?.isAiAssistant && (
            <button
              type="button"
              className={`btn-db-search-toggle${dbSearchOpen ? ' active' : ''}`}
              onClick={handleDbSearchToggle}
              title="ค้นหาทั้งฐานข้อมูล (ต่างจากคุยกับ AI)"
            >
              🔍 ค้นหาDB
            </button>
          )}
          {currentGroup?.isAiAssistant && canTestOcr && (
            <button
              type="button"
              className={`btn-db-search-toggle${ocrTestOpen ? ' active' : ''}`}
              onClick={handleOcrTestToggle}
              title="ทดสอบ OCR จากรูปที่อัปโหลด (ไม่ผ่าน LINE, ไม่บันทึกลง DB)"
            >
              🧪 ทดสอบ OCR
            </button>
          )}
          {currentGroup?.isAiAssistant && ocrTestOpen ? (
            <div className="ocr-test-panel">
              {/* จุดวางรูปหลักคือพื้นที่แชทด้านบน (ใหญ่กว่า เห็นชัดกว่า) — ดู .ai-assistant-messages
                  ที่มี onDrop/onDragOver ผูกไว้ตอน ocrTestOpen เป็น true เหมือนกัน */}
              <div className="ocr-test-type-row">
                <button
                  type="button"
                  className={`btn-ocr-type${ocrTestType === 'payment' ? ' active' : ''}`}
                  onClick={() => handleOcrTypeChange('payment')}
                >
                  💳 การโอน-ตั้งเบิก (2 รูป)
                </button>
                <button
                  type="button"
                  className={`btn-ocr-type${ocrTestType === 'receipt' ? ' active' : ''}`}
                  onClick={() => handleOcrTypeChange('receipt')}
                >
                  🧾 สรุปใบเสร็จ (1-10 รูป)
                </button>
                <button
                  type="button"
                  className={`btn-ocr-type${ocrTestType === 'ledger' ? ' active' : ''}`}
                  onClick={() => handleOcrTypeChange('ledger')}
                >
                  📖 เช็คยอดสมุดบัญชี
                </button>
                {ocrTestImages.length < getOcrMaxImages() && (
                  <button
                    type="button"
                    className="btn-ocr-add-icon"
                    title="เพิ่มรูป"
                    onClick={() => ocrFileInputRef.current?.click()}
                  >
                    📎
                  </button>
                )}
              </div>
              {ocrTestType === 'ledger' && (
                <div className="ocr-test-type-row">
                  <select
                    className="ocr-ledger-group-select"
                    value={ocrLedgerGroupId}
                    onChange={(e) => setOcrLedgerGroupId(e.target.value)}
                  >
                    <option value="">
                      {ocrLedgerAccountsLoading ? 'กำลังโหลดกลุ่ม...' : '— เลือกกลุ่ม/บริษัท —'}
                    </option>
                    {ocrLedgerAccounts.map((acc) => (
                      <option key={acc.groupId} value={acc.groupId}>
                        {acc.groupName} (ยอดปัจจุบัน {acc.latestBalance != null ? Number(acc.latestBalance).toLocaleString('th-TH') : '—'})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={`btn-ocr-type${ocrLedgerMode === 'slip' ? ' active' : ''}`}
                    onClick={() => handleOcrLedgerModeChange('slip')}
                  >
                    💸 สลิปโอนเงิน (1-2 รูป)
                  </button>
                  <button
                    type="button"
                    className={`btn-ocr-type${ocrLedgerMode === 'book' ? ' active' : ''}`}
                    onClick={() => handleOcrLedgerModeChange('book')}
                  >
                    📔 เช็คสมุด (1 รูป)
                  </button>
                </div>
              )}
              <div className="ocr-test-images-row">
                {ocrTestImages.map((img, i) => (
                  <div key={i} className="ocr-test-thumb">
                    <img src={img.dataUrl} alt={img.name} />
                    <button type="button" className="ocr-test-thumb-remove" onClick={() => handleOcrRemoveImage(i)}>×</button>
                  </div>
                ))}
                <input
                  ref={ocrFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleOcrFilesSelected}
                />
              </div>
              <button
                className="btn-compose-send"
                disabled={!ocrCountValid || aiThinking}
                onClick={handleOcrTestSubmit}
              >
                ทดสอบ OCR
              </button>
            </div>
          ) : currentGroup?.isAiAssistant && dbSearchOpen ? (
            <>
              <input
                ref={dbSearchInputRef}
                className="compose-input"
                placeholder="พิมพ์คำค้น แล้ว Enter (ค้นหาทุกกลุ่ม/DM ไม่จำกัดช่วงเวลา)"
                value={dbSearchText}
                onChange={(e) => setDbSearchText(e.target.value)}
                onKeyDown={handleDbSearchKeyDown}
              />
              <button
                className="btn-compose-send"
                disabled={!dbSearchText.trim() || aiThinking}
                onClick={handleDbSearchSubmit}
              >
                ค้นหา
              </button>
            </>
          ) : (
            <>
              <textarea
                className="compose-input"
                placeholder={currentGroup?.isAiAssistant ? 'คุยกับ AI ผู้ช่วยได้เลย... (พิมพ์ "showfeature" เพื่อดูคำสั่งทั้งหมด)' : 'พิมพ์ข้อความส่งเข้าห้องนี้ หรือ "ค้นหา ชื่อไฟล์" / "สรุปเลย"...'}
                rows={1}
                value={composeText}
                onChange={(e) => setComposeText(e.target.value)}
                onKeyDown={handleComposeKeyDown}
              />
              <button
                className="btn-compose-send"
                disabled={!composeText.trim() || (currentGroup?.isAiAssistant ? aiThinking : checkingCommand)}
                onClick={handleComposeSubmit}
              >
                ส่ง
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Confirm Delete Modal ─────────────────────────────── */}
      {confirmDeleteOpen && (
        <div className="drive-overlay" onClick={() => !deleting && setConfirmDeleteOpen(false)}>
          <div className="drive-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="drive-confirm-icon">🗑️</div>
            <h3>ยืนยันการลบ</h3>
            <p>ลบ <strong>{selectedIds.size} ข้อความ</strong> ออกจากระบบถาวร?</p>
            <p className="drive-confirm-warn">ไม่สามารถกู้คืนได้ (รวมไฟล์แนบใน Drive/GCS)</p>
            <div className="drive-confirm-actions">
              <button className="btn-cancel" autoFocus onClick={() => setConfirmDeleteOpen(false)} disabled={deleting}>
                ยกเลิก
              </button>
              <button className="btn-confirm-delete" onClick={handleConfirmDelete} disabled={deleting}>
                {deleting ? 'กำลังลบ...' : 'ลบเลย'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Forward Picker Modal ──────────────────────────────── */}
      {forwardOpen && (() => {
        const candidates = groups.filter((g) => {
          if (g.groupId === currentGroup?.groupId) return false
          if (!forwardSearch.trim()) return true
          return g.groupName?.toLowerCase().includes(forwardSearch.trim().toLowerCase())
        })
        const target = groups.find((g) => g.groupId === forwardTargetId)

        return (
          <div className="drive-overlay" onClick={() => !forwarding && closeForwardPicker()}>
            <div className="drive-confirm forward-confirm" onClick={(e) => e.stopPropagation()}>
              <h3>ส่งต่อไปยัง...</h3>
              <input
                className="forward-search-input"
                placeholder="ค้นหากลุ่ม/ผู้ใช้..."
                value={forwardSearch}
                onChange={(e) => setForwardSearch(e.target.value)}
              />
              <div className="forward-group-list">
                {candidates.length === 0 ? (
                  <div className="forward-empty">ไม่พบกลุ่ม/ผู้ใช้</div>
                ) : (
                  candidates.map((g) => (
                    <div
                      key={g.groupId}
                      className={`forward-group-item${g.groupId === forwardTargetId ? ' selected' : ''}`}
                      onClick={() => setForwardTargetId(g.groupId)}
                    >
                      {g.pictureUrl ? (
                        <img className="forward-group-avatar" src={g.pictureUrl} alt={g.groupName} />
                      ) : (
                        <div className="forward-group-avatar" style={{ background: getColor(g.groupName) }}>
                          {getInitials(g.groupName)}
                        </div>
                      )}
                      <span className="forward-group-name">{g.groupName}</span>
                    </div>
                  ))
                )}
              </div>
              {target && <p className="forward-target-label">ส่งต่อ {selectedIds.size} ข้อความ ไปยัง "{target.groupName}"</p>}
              <div className="drive-confirm-actions" onKeyDown={handleForwardArrowNav}>
                <button
                  ref={cancelBtnRef}
                  className="btn-cancel"
                  autoFocus
                  onFocus={() => setForwardFocused('cancel')}
                  onClick={closeForwardPicker}
                  disabled={forwarding}
                >
                  ยกเลิก
                </button>
                <button
                  ref={forwardBtnRef}
                  className={`btn-forward-confirm${forwardFocused === 'confirm' ? ' focused' : ''}`}
                  onFocus={() => setForwardFocused('confirm')}
                  onMouseDown={handleForwardMouseDown}
                  onClick={handleConfirmForward}
                  disabled={!forwardTargetId || forwarding}
                >
                  {forwarding ? 'กำลังส่งต่อ...' : 'ส่งต่อ'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Confirm Send Modal ───────────────────────────────── */}
      {sendConfirmOpen && (
        <div className="drive-overlay" onClick={() => !sending && closeSendConfirm()}>
          <div className="drive-confirm forward-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>ยืนยันการส่งข้อความ</h3>
            <p>ส่งข้อความนี้เข้าห้อง <strong>"{currentGroup?.groupName}"</strong> จริง?</p>
            <p className="drive-confirm-warn" style={{ whiteSpace: 'pre-wrap', textAlign: 'left' }}>
              "{composeText}"
            </p>
            <p className="drive-confirm-warn">ข้อความจะถูกส่งเข้า LINE ทันที ไม่สามารถเรียกคืนได้</p>
            <div className="drive-confirm-actions" onKeyDown={handleSendArrowNav}>
              <button
                ref={sendCancelBtnRef}
                className="btn-cancel"
                autoFocus
                onFocus={() => setSendFocused('cancel')}
                onClick={closeSendConfirm}
                disabled={sending}
              >
                ยกเลิก
              </button>
              <button
                ref={sendConfirmBtnRef}
                className={`btn-forward-confirm${sendFocused === 'confirm' ? ' focused' : ''}`}
                onFocus={() => setSendFocused('confirm')}
                onMouseDown={handleSendMouseDown}
                onClick={handleConfirmSend}
                disabled={sending}
              >
                {sending ? 'กำลังส่ง...' : 'ส่งเลย'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
