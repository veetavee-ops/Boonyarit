import { useMemo } from 'react'
import './ErDiagram.css'

// จัดกลุ่มตารางที่เกี่ยวข้องกันไว้ใกล้ๆ กัน ลดจำนวนเส้นที่ต้องลากข้ามไปไกล — ตารางใหม่ที่ไม่อยู่ใน
// ลิสต์นี้จะถูกต่อท้ายเป็นแถวเพิ่มอัตโนมัติ ไม่ต้องแก้โค้ดตรงนี้ทุกครั้งที่มี model ใหม่
const ORDER = [
  ['users', 'messages', 'groups', 'paymentVerifications'],
  ['admins', 'adminGroups', 'labels', 'accountLedgerEntries'],
  ['settings', 'groupLabels', 'ledgerBalanceEntries', 'aiProviders'],
]

const BOX_WIDTH = 240
const COL_GAP = 70
const ROW_GAP = 80
const HEADER_H = 32
const FIELD_H = 18
const PADDING = 14
const MAX_VISIBLE_FIELDS = 8

function boxHeight(columns) {
  const shown = Math.min(columns.length, MAX_VISIBLE_FIELDS)
  const truncated = columns.length > MAX_VISIBLE_FIELDS
  return HEADER_H + shown * FIELD_H + (truncated ? FIELD_H : 0) + PADDING
}

// จุดตัดขอบกล่องในทิศทางที่ชี้ไปยังกล่องอีกฝั่ง — ใช้ลากเส้นให้จบที่ขอบกรอบพอดี ไม่ทะลุเข้าไปในกล่อง
function edgePoint(box, towardX, towardY) {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const dx = towardX - cx
  const dy = towardY - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const halfW = box.w / 2
  const halfH = box.h / 2
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity
  const scale = Math.min(scaleX, scaleY)
  return { x: cx + dx * scale, y: cy + dy * scale }
}

export default function ErDiagram({ tables, edges, onSelectTable }) {
  const byKey = useMemo(() => {
    const m = {}
    tables.forEach((t) => { m[t.key] = t })
    return m
  }, [tables])

  const rows = useMemo(() => {
    const placed = new Set(ORDER.flat())
    const leftover = tables.map((t) => t.key).filter((k) => !placed.has(k))
    const extraRows = []
    for (let i = 0; i < leftover.length; i += 4) extraRows.push(leftover.slice(i, i + 4))
    return [...ORDER, ...extraRows].filter((row) => row.some((k) => byKey[k]))
  }, [tables, byKey])

  const boxes = useMemo(() => {
    const result = {}
    let y = 40
    rows.forEach((row) => {
      let rowMaxH = 0
      row.forEach((key) => {
        const t = byKey[key]
        if (!t) return
        const h = boxHeight(t.columns)
        rowMaxH = Math.max(rowMaxH, h)
      })
      row.forEach((key, col) => {
        const t = byKey[key]
        if (!t) return
        result[key] = {
          x: 40 + col * (BOX_WIDTH + COL_GAP),
          y,
          w: BOX_WIDTH,
          h: boxHeight(t.columns),
        }
      })
      y += rowMaxH + ROW_GAP
    })
    return result
  }, [rows, byKey])

  const canvasSize = useMemo(() => {
    let maxX = 0
    let maxY = 0
    Object.values(boxes).forEach((b) => {
      maxX = Math.max(maxX, b.x + b.w)
      maxY = Math.max(maxY, b.y + b.h)
    })
    return { width: maxX + 40, height: maxY + 40 }
  }, [boxes])

  return (
    <div className="erd-scroll">
      <div className="erd-canvas" style={{ width: canvasSize.width, height: canvasSize.height }}>
        <svg className="erd-lines" width={canvasSize.width} height={canvasSize.height}>
          {edges.map((e, i) => {
            const fromBox = boxes[e.from]
            const toBox = boxes[e.to]
            if (!fromBox || !toBox) return null
            const fromCenter = { x: fromBox.x + fromBox.w / 2, y: fromBox.y + fromBox.h / 2 }
            const toCenter = { x: toBox.x + toBox.w / 2, y: toBox.y + toBox.h / 2 }
            const p1 = edgePoint(fromBox, toCenter.x, toCenter.y)
            const p2 = edgePoint(toBox, fromCenter.x, fromCenter.y)
            const manyLabelX = p1.x + (p2.x - p1.x) * 0.12
            const manyLabelY = p1.y + (p2.y - p1.y) * 0.12
            const oneLabelX = p2.x + (p1.x - p2.x) * 0.12
            const oneLabelY = p2.y + (p1.y - p2.y) * 0.12
            return (
              <g key={i}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className="erd-edge-line" />
                <text x={manyLabelX} y={manyLabelY} className="erd-edge-label">∞</text>
                <text x={oneLabelX} y={oneLabelY} className="erd-edge-label">1</text>
              </g>
            )
          })}
        </svg>

        {tables.map((t) => {
          const box = boxes[t.key]
          if (!box) return null
          const shown = t.columns.slice(0, MAX_VISIBLE_FIELDS)
          const hiddenCount = t.columns.length - shown.length
          return (
            <div
              key={t.key}
              className="erd-box"
              style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
              onClick={() => onSelectTable({ key: t.key, label: t.label })}
            >
              <div className="erd-box-title">{t.label}</div>
              <div className="erd-box-fields">
                {shown.map((c) => (
                  <div key={c.name} className="erd-field">
                    {c.primaryKey ? (
                      <span className="erd-key-icon" title="Primary Key">🔑</span>
                    ) : c.isForeignKey ? (
                      <span className="erd-fk-icon" title="Foreign Key">↳</span>
                    ) : (
                      <span className="erd-key-spacer" />
                    )}
                    <span
                      className={`erd-field-name${c.primaryKey ? ' erd-field-name--pk' : c.isForeignKey ? ' erd-field-name--fk' : ''}`}
                    >
                      {c.name}
                    </span>
                    {c.sensitive && <span className="erd-sensitive-dot" title="ข้อมูลอ่อนไหว — ถูกซ่อนตอนดูข้อมูลจริง" />}
                  </div>
                ))}
                {hiddenCount > 0 && (
                  <div className="erd-field erd-field--more">+{hiddenCount} ฟิลด์เพิ่มเติม</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
