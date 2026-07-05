import { useState, useEffect, useRef, useCallback } from "react";
import { fetchAvailableDates, fetchActiveGroups } from "../../api/messages";
import { formatDateLabel, getInitials, getColor } from "../../utils/helpers";
import "./SummarySidebar.css";

const RANGE_VALUES = [1, 2, 3, 5, 7, 14, 30, 60, 90];
const RANGE_UNITS = [
  { value: "day", label: "วัน" },
  { value: "month", label: "เดือน" },
  { value: "year", label: "ปี" },
];

const AI_PROVIDERS = [
  { value: 'groq', label: '⚡ Groq — Llama 3.3 70B', sub: 'เร็ว · ฟรี' },
  { value: 'gemini', label: '✨ Gemini — Flash 2.0', sub: 'Google AI' },
];

// Sidebar ด้านขวา — ย้ายมาจาก sidebar ซ้ายทั้งหมด (เดิมอยู่ใน controls-section)
// ทำงานเหมือน sidebar ซ้ายทุกอย่าง (ปักหมุด/hover-peek/resize) แค่ยึดขอบขวาแทน
export default function SummarySidebar({
  isOpen,
  onClose,
  refreshKey,
  selectedDate,
  onSelectDate,
  onSummarizeDay,
  onRangeChange,
  aiProvider = 'groq',
  onAiProviderChange,
  onPinChange,
}) {
  const [dates, setDates] = useState([]);
  const [loadingDates, setLoadingDates] = useState(true);
  const [activeGroups, setActiveGroups] = useState([]);
  const [summarizeGroupId, setSummarizeGroupId] = useState("all");
  // เปิด/ปิด dropdown เลือกกลุ่ม (แบบ custom เพื่อโชว์ไอคอนกลุ่มได้ — native <select> ใส่รูปไม่ได้)
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);

  // Resize state
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(280);

  const [isPinned, setIsPinned] = useState(() => {
    const stored = localStorage.getItem("summarySidebarPinned");
    return stored === null ? true : stored === "true";
  });
  const [isHovering, setIsHovering] = useState(false);
  const hoverHideTimer = useRef(null);

  const visible = isOpen || isPinned || isHovering;

  const cancelHoverHide = () => {
    if (hoverHideTimer.current) {
      clearTimeout(hoverHideTimer.current);
      hoverHideTimer.current = null;
    }
  };
  const handleHoverEnter = () => {
    cancelHoverHide();
    setIsHovering(true);
  };
  const handleHoverLeave = () => {
    if (isPinned) return;
    cancelHoverHide();
    hoverHideTimer.current = setTimeout(() => {
      setIsHovering(false);
      onClose();
    }, 200);
  };

  const togglePin = () => {
    setIsPinned((prev) => {
      const next = !prev;
      localStorage.setItem("summarySidebarPinned", String(next));
      if (!next) setIsHovering(true);
      return next;
    });
  };

  useEffect(() => cancelHoverHide, []);

  useEffect(() => {
    onPinChange?.(isPinned ? sidebarWidth : 0);
  }, [isPinned, sidebarWidth, onPinChange]);

  const onResizeMouseDown = useCallback(
    (e) => {
      isResizing.current = true;
      startX.current = e.clientX;
      startWidth.current = sidebarWidth;
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    },
    [sidebarWidth],
  );

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isResizing.current) return;
      // ขอบขวา → ลากซ้าย (delta ติดลบ) แปลว่ากว้างขึ้น จึงกลับเครื่องหมาย delta เทียบกับ sidebar ซ้าย
      const delta = startX.current - e.clientX;
      const newWidth = Math.min(1000, Math.max(200, startWidth.current + delta));
      setSidebarWidth(newWidth);
    };
    const onMouseUp = () => {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const [rangeValue, setRangeValue] = useState(7);
  const [rangeUnit, setRangeUnit] = useState("day");

  useEffect(() => {
    const loadDates = async () => {
      setLoadingDates(true);
      try {
        const availableDates = await fetchAvailableDates(rangeValue, rangeUnit);
        if (availableDates.length > 0) {
          setDates(availableDates);
          if (!availableDates.includes(selectedDate) && selectedDate !== "all") {
            onSelectDate(availableDates[0]);
          }
        } else {
          setDates([]);
        }
      } catch (err) {
        console.error("Failed to load dates", err);
      } finally {
        setLoadingDates(false);
      }
    };
    loadDates();
  }, [rangeValue, rangeUnit, refreshKey]);

  useEffect(() => {
    fetchActiveGroups(selectedDate, rangeValue, rangeUnit).then((groups) => {
      setActiveGroups(groups);
      if (summarizeGroupId !== "all" && !groups.find((g) => g.groupId === summarizeGroupId)) {
        setSummarizeGroupId("all");
      }
    });
  }, [selectedDate, rangeValue, rangeUnit]);

  useEffect(() => {
    onRangeChange?.({ rangeValue, rangeUnit });
  }, [rangeValue, rangeUnit]);

  // ปิด dropdown เลือกกลุ่มเมื่อคลิกที่อื่นนอก dropdown
  useEffect(() => {
    if (!groupPickerOpen) return;
    const close = () => setGroupPickerOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [groupPickerOpen]);

  const selectedGroupInfo = activeGroups.find((g) => g.groupId === summarizeGroupId);

  return (
    <>
      <div
        className="summary-sidebar-hover-trigger"
        onMouseEnter={handleHoverEnter}
        onMouseLeave={handleHoverLeave}
      />
      <div
        className={`summary-sidebar-overlay ${isOpen && !isPinned ? "active" : ""}`}
        onClick={onClose}
      />
      <aside
        className={`summary-sidebar ${visible ? "active" : ""}${isPinned ? " summary-sidebar--pinned" : ""}`}
        style={{ width: sidebarWidth, right: visible ? 0 : -sidebarWidth }}
        onMouseEnter={handleHoverEnter}
        onMouseLeave={handleHoverLeave}
      >
        <div className="summary-sidebar-resize-handle" onMouseDown={onResizeMouseDown} />

        <div className="summary-sidebar-header">
          <div className="summary-sidebar-brand">
            <div>
              <div className="summary-sidebar-brand-title">ตั้งค่าการสรุป AI</div>
              <div className="summary-sidebar-brand-sub">เลือกช่วงเวลาและวันที่</div>
            </div>
          </div>
          <button
            className={`summary-sidebar-pin-btn${isPinned ? " summary-sidebar-pin-btn--active" : ""}`}
            onClick={togglePin}
            title={isPinned ? "เลิกปักหมุด" : "ปักหมุดเมนูไว้"}
            aria-label={isPinned ? "เลิกปักหมุด" : "ปักหมุดเมนูไว้"}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
            </svg>
          </button>
        </div>

        <div className="summary-sidebar-content">
          {/* ── Range filter row ── */}
          <div>
            <label className="input-label">
              <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                <path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z" />
              </svg>
              ย้อนหลัง
            </label>
            <div className="range-filter-row">
              <select
                className="range-select range-value"
                value={rangeValue}
                onChange={(e) => setRangeValue(Number(e.target.value))}
              >
                {RANGE_VALUES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <select
                className="range-select range-unit"
                value={rangeUnit}
                onChange={(e) => setRangeUnit(e.target.value)}
              >
                {RANGE_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── AI Summary date dropdown ── */}
          <div className="date-select-wrapper">
            <label htmlFor="summary-date-select" className="input-label">
              <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                <path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z" />
              </svg>
              วันที่สรุป {loadingDates ? "…" : ""}
            </label>
            <select
              id="summary-date-select"
              className="date-dropdown"
              value={selectedDate}
              onChange={(e) => onSelectDate(e.target.value)}
              disabled={loadingDates}
            >
              <option value="all">ทั้งหมด ({dates.length} วัน)</option>
              {dates.map((d) => (
                <option key={d} value={d}>{formatDateLabel(d)} ({d.slice(5)})</option>
              ))}
            </select>
            <div className="date-hint">เลือกวันเพื่อให้ AI สรุปแชทของวันนั้น</div>
          </div>

          {/* ── Group selector for summarization (custom dropdown — โชว์ไอคอนกลุ่มได้) ── */}
          <div className="date-select-wrapper">
            <label className="input-label">
              <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
              </svg>
              กลุ่มที่จะสรุป
            </label>
            <div className="group-picker">
              <button
                type="button"
                className="group-picker-btn"
                onClick={(e) => { e.stopPropagation(); setGroupPickerOpen((v) => !v); }}
              >
                {selectedGroupInfo ? (
                  <>
                    {selectedGroupInfo.pictureUrl ? (
                      <img className="group-picker-avatar group-picker-avatar--img" src={selectedGroupInfo.pictureUrl} alt="" />
                    ) : (
                      <span className="group-picker-avatar" style={{ background: getColor(selectedGroupInfo.groupName) }}>
                        {getInitials(selectedGroupInfo.groupName)}
                      </span>
                    )}
                    <span className="group-picker-name">{selectedGroupInfo.groupName}</span>
                  </>
                ) : (
                  <>
                    <span className="group-picker-avatar group-picker-avatar--all">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                      </svg>
                    </span>
                    <span className="group-picker-name">ทุกกลุ่ม ({activeGroups.length} กลุ่ม)</span>
                  </>
                )}
                <svg className="group-picker-chevron" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              </button>

              {groupPickerOpen && (
                <div className="group-picker-list" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={`group-picker-item${summarizeGroupId === 'all' ? ' group-picker-item--active' : ''}`}
                    onClick={() => { setSummarizeGroupId('all'); setGroupPickerOpen(false); }}
                  >
                    <span className="group-picker-avatar group-picker-avatar--all">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                      </svg>
                    </span>
                    <span className="group-picker-name">ทุกกลุ่ม ({activeGroups.length} กลุ่ม)</span>
                  </button>
                  {activeGroups.map((g) => (
                    <button
                      type="button"
                      key={g.groupId}
                      className={`group-picker-item${summarizeGroupId === g.groupId ? ' group-picker-item--active' : ''}`}
                      onClick={() => { setSummarizeGroupId(g.groupId); setGroupPickerOpen(false); }}
                    >
                      {g.pictureUrl ? (
                        <img className="group-picker-avatar group-picker-avatar--img" src={g.pictureUrl} alt="" />
                      ) : (
                        <span className="group-picker-avatar" style={{ background: getColor(g.groupName) }}>
                          {getInitials(g.groupName)}
                        </span>
                      )}
                      <span className="group-picker-name">{g.groupName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── AI Provider selector ── */}
          <div className="date-select-wrapper">
            <label className="input-label">
              <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
              </svg>
              AI ที่ใช้สรุป
            </label>
            <select
              className="date-dropdown"
              value={aiProvider}
              onChange={(e) => onAiProviderChange?.(e.target.value)}
            >
              {AI_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label} ({p.sub})</option>
              ))}
            </select>
          </div>

          <button className="btn-summarize-day" onClick={() => onSummarizeDay(summarizeGroupId)}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
            </svg>
            สรุป
          </button>
          <p className="btn-summarize-model">
            สรุปโดย {AI_PROVIDERS.find(p => p.value === aiProvider)?.label || aiProvider}
          </p>
        </div>
      </aside>
    </>
  );
}
