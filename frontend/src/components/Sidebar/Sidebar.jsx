import { useState, useEffect, useRef, useCallback } from "react";
import {
  formatDateLabel,
  getInitials,
  getColor,
  getLast7Days,
} from "../../utils/helpers";
import { fetchAvailableDates, fetchActiveGroups } from "../../api/messages";
import { fetchLabels, createLabel, deleteLabel, assignGroup, unassignGroup } from "../../api/labels";
import "./Sidebar.css";

// สีที่เลือกได้สำหรับ label
const LABEL_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
];

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

export default function Sidebar({
  isOpen,
  onClose,
  refreshKey,
  selectedDate,
  selectedGroup,
  realGroups,
  privateChats = [],
  groupSortBy,
  onSortChange,
  onSelectDate,
  onSelectGroup,
  onSummarizeDay,
  onRangeChange,
  aiProvider = 'groq',
  onAiProviderChange,
  onOpenDriveFiles,
}) {
  const [dates, setDates] = useState([]);
  const [loadingDates, setLoadingDates] = useState(true);
  const [activeGroups, setActiveGroups] = useState([]);
  const [summarizeGroupId, setSummarizeGroupId] = useState("all");

  // --- Label / Tab state ---
  // labels: รายการ label ทั้งหมด [{ id, name, color, groupIds }]
  const [labels, setLabels] = useState([]);
  // selectedLabel: id ของ tab ที่เลือกอยู่ (null = ทั้งหมด)
  const [selectedLabel, setSelectedLabel] = useState(null);
  // openLabelMenu: groupId ของกลุ่มที่เปิด dropdown label อยู่ (null = ปิดทั้งหมด)
  const [openLabelMenu, setOpenLabelMenu] = useState(null);
  // showNewLabelForm: แสดงฟอร์มสร้าง label ใหม่ไหม
  const [showNewLabelForm, setShowNewLabelForm] = useState(false);
  // newLabelName: ชื่อที่พิมพ์ในฟอร์มสร้าง label ใหม่
  const [newLabelName, setNewLabelName] = useState('');
  // newLabelColor: สีที่เลือกในฟอร์มสร้าง label ใหม่
  const [newLabelColor, setNewLabelColor] = useState('#3b82f6');

  // Resize state
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(280);

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
      const delta = e.clientX - startX.current;
      const newWidth = Math.min(
        1000,
        Math.max(200, startWidth.current + delta),
      );
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

  // Range filter state
  const [rangeValue, setRangeValue] = useState(7);
  const [rangeUnit, setRangeUnit] = useState("day");

  // Fetch dates whenever range or refreshKey changes
  useEffect(() => {
    const loadDates = async () => {
      setLoadingDates(true);
      try {
        const availableDates = await fetchAvailableDates(rangeValue, rangeUnit);

        if (availableDates.length > 0) {
          setDates(availableDates);
          // If current selectedDate is not in re-fetched list, select newest
          if (
            !availableDates.includes(selectedDate) &&
            selectedDate !== "all"
          ) {
            onSelectDate(availableDates[0]);
          }
        } else {
          setDates([]);
        }
      } catch (err) {
        console.error("Failed to load dates", err);
        setDates(getLast7Days());
      } finally {
        setLoadingDates(false);
      }
    };
    loadDates();
  }, [rangeValue, rangeUnit, refreshKey]);

  // Fetch active groups when date or range changes
  useEffect(() => {
    fetchActiveGroups(selectedDate, rangeValue, rangeUnit).then((groups) => {
      setActiveGroups(groups);
      // Reset to 'all' if selected group no longer active
      if (
        summarizeGroupId !== "all" &&
        !groups.find((g) => g.groupId === summarizeGroupId)
      ) {
        setSummarizeGroupId("all");
      }
    });
  }, [selectedDate, rangeValue, rangeUnit]);

  // Notify parent when range changes
  useEffect(() => {
    onRangeChange?.({ rangeValue, rangeUnit });
  }, [rangeValue, rangeUnit]);

  // โหลด labels ครั้งแรกที่ sidebar เปิด
  useEffect(() => {
    fetchLabels()
      .then((data) => setLabels(Array.isArray(data) ? data : []))
      .catch(() => setLabels([]));
  }, []);

  // สร้าง label ใหม่แล้ว refresh รายการ
  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) return;
    try {
      const created = await createLabel(newLabelName.trim(), newLabelColor);
      // เพิ่ม label ใหม่เข้า state โดยตรง ไม่ต้อง fetch ใหม่ทั้งหมด
      setLabels((prev) => [...prev, created]);
      setNewLabelName('');
      setNewLabelColor('#3b82f6');
      setShowNewLabelForm(false);
    } catch (err) {
      console.error('[Label] create failed:', err);
      alert('สร้าง label ไม่สำเร็จ: ' + (err.response?.data?.error || err.message));
    }
  };

  // ลบ label แล้ว reset tab ถ้าลบ tab ที่เลือกอยู่
  const handleDeleteLabel = async (labelId) => {
    await deleteLabel(labelId);
    setLabels((prev) => prev.filter((l) => l.id !== labelId));
    if (selectedLabel === labelId) setSelectedLabel(null);
  };

  // toggle: ถ้ากลุ่มอยู่ใน label แล้วให้เอาออก, ถ้ายังไม่อยู่ให้เพิ่มเข้าไป
  const handleToggleGroupLabel = async (labelId, groupId) => {
    const label = labels.find((l) => l.id === labelId);
    const isAssigned = label?.groupIds.includes(groupId);
    if (isAssigned) {
      await unassignGroup(labelId, groupId);
      // อัปเดต state — เอา groupId ออกจาก label นั้น
      setLabels((prev) =>
        prev.map((l) =>
          l.id === labelId
            ? { ...l, groupIds: l.groupIds.filter((id) => id !== groupId) }
            : l
        )
      );
    } else {
      await assignGroup(labelId, groupId);
      // อัปเดต state — เพิ่ม groupId เข้า label นั้น
      setLabels((prev) =>
        prev.map((l) =>
          l.id === labelId ? { ...l, groupIds: [...l.groupIds, groupId] } : l
        )
      );
    }
  };

  // ปิด label dropdown เมื่อคลิกที่อื่นนอก dropdown
  useEffect(() => {
    if (openLabelMenu === null) return;
    const close = () => setOpenLabelMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openLabelMenu]);

  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [isGroupsOpen, setIsGroupsOpen] = useState(true);

  return (
    <>
      <div
        className={`sidebar-overlay ${isOpen ? "active" : ""}`}
        onClick={onClose}
      />
      <aside
        className={`sidebar ${isOpen ? "active" : ""}`}
        style={{ width: sidebarWidth }}
      >
        <div
          className="sidebar-resize-handle"
          onMouseDown={onResizeMouseDown}
        />
        <div
          className={`sidebar-header${isControlsOpen ? "" : " sidebar-header--collapsed"}`}
        >
          <div
            className="sidebar-brand"
            onClick={() => setIsControlsOpen((v) => !v)}
          >
            <div>
              <div className="sidebar-brand-title">ตั้งค่าการสรุป AI</div>
              <div className="sidebar-brand-sub">เลือกช่วงเวลาและวันที่</div>
            </div>
            <span className="chevron">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="20"
                height="20"
                style={{
                  transform: isControlsOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                }}
              >
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </span>
          </div>

          {isControlsOpen && (
            <div className="controls-section">
              {/* ── Range filter row ── */}
              <div>
                <label className="input-label">
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="12"
                    height="12"
                  >
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
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <select
                    className="range-select range-unit"
                    value={rangeUnit}
                    onChange={(e) => setRangeUnit(e.target.value)}
                  >
                    {RANGE_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ── AI Summary date dropdown ── */}
              <div className="date-select-wrapper">
                <label htmlFor="date-select" className="input-label">
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="12"
                    height="12"
                  >
                    <path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z" />
                  </svg>
                  วันที่สรุป {loadingDates ? "…" : ""}
                </label>
                <select
                  id="date-select"
                  className="date-dropdown"
                  value={selectedDate}
                  onChange={(e) => onSelectDate(e.target.value)}
                  disabled={loadingDates}
                >
                  <option value="all">ทั้งหมด ({dates.length} วัน)</option>
                  {dates.map((d) => (
                    <option key={d} value={d}>
                      {formatDateLabel(d)} ({d.slice(5)})
                    </option>
                  ))}
                </select>
                <div className="date-hint">
                  เลือกวันเพื่อให้ AI สรุปแชทของวันนั้น
                </div>
              </div>

              {/* ── Group selector for summarization ── */}
              <div className="date-select-wrapper">
                <label className="input-label">
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="12"
                    height="12"
                  >
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                  </svg>
                  กลุ่มที่จะสรุป
                </label>
                <select
                  className="date-dropdown"
                  value={summarizeGroupId}
                  onChange={(e) => setSummarizeGroupId(e.target.value)}
                >
                  <option value="all">
                    ทุกกลุ่ม ({activeGroups.length} กลุ่ม)
                  </option>
                  {activeGroups.map((g) => (
                    <option key={g.groupId} value={g.groupId}>
                      {g.groupName}
                    </option>
                  ))}
                </select>
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
                    <option key={p.value} value={p.value}>
                      {p.label} ({p.sub})
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="btn-summarize-day"
                onClick={() => onSummarizeDay(summarizeGroupId)}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  width="15"
                  height="15"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                </svg>
                สรุป
              </button>
              <p className="btn-summarize-model">
                สรุปโดย {AI_PROVIDERS.find(p => p.value === aiProvider)?.label || aiProvider}
              </p>
            </div>
          )}
        </div>

        <div className="sidebar-content">
          {/* ── Content Header ── */}
          <div className="content-header">
            <div className="content-header-left">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="14"
                height="14"
              >
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
              </svg>
              <span>กลุ่ม</span>
            </div>
            <span className="content-header-count">{realGroups.length}</span>
          </div>

          {/* ── Label Tabs — แถบกรองกลุ่มตาม label ── */}
          <div className="label-tabs-bar">
            {/* Tab "ทั้งหมด" */}
            <button
              className={`label-tab ${selectedLabel === null ? 'label-tab--active' : ''}`}
              onClick={() => setSelectedLabel(null)}
            >
              ทั้งหมด
            </button>

            {/* Tab แต่ละ label */}
            {labels.map((label) => (
              <div key={label.id} className="label-tab-wrap">
                <button
                  className={`label-tab ${selectedLabel === label.id ? 'label-tab--active' : ''}`}
                  style={selectedLabel === label.id ? { borderColor: label.color, color: label.color } : {}}
                  onClick={() => setSelectedLabel(label.id)}
                >
                  {/* จุดสีแสดง label */}
                  <span className="label-tab-dot" style={{ background: label.color }} />
                  {label.name}
                </button>
                {/* ปุ่ม x ลบ label — แสดงเมื่อ tab นี้ถูกเลือกอยู่ */}
                {selectedLabel === label.id && (
                  <button
                    className="label-tab-delete"
                    onClick={() => handleDeleteLabel(label.id)}
                    title="ลบ label นี้"
                  >×</button>
                )}
              </div>
            ))}

            {/* ปุ่ม + เพิ่ม label ใหม่ */}
            <button
              className="label-tab label-tab--add"
              onClick={() => setShowNewLabelForm((v) => !v)}
              title="เพิ่ม label"
            >+</button>
          </div>

          {/* ── ฟอร์มสร้าง label ใหม่ (แสดงเมื่อกด +) ── */}
          {showNewLabelForm && (
            <div className="new-label-form">
              {/* ช่องพิมพ์ชื่อ */}
              <input
                className="new-label-input"
                placeholder="ชื่อ label..."
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateLabel()}
                autoFocus
              />
              {/* เลือกสี */}
              <div className="new-label-colors">
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`color-dot ${newLabelColor === c ? 'color-dot--selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNewLabelColor(c)}
                  />
                ))}
              </div>
              <div className="new-label-actions">
                <button className="btn-label-save" onClick={handleCreateLabel}>สร้าง</button>
                <button className="btn-label-cancel" onClick={() => setShowNewLabelForm(false)}>ยกเลิก</button>
              </div>
            </div>
          )}

          {/* ── กลุ่ม ── */}
          <div className={`section ${isGroupsOpen ? "is-open" : ""}`}>
            <div
              className="section-header-clickable"
              onClick={() => setIsGroupsOpen((v) => !v)}
            >
              <span className="section-title">
                กลุ่ม
                {realGroups.length > 0 && (
                  <span className="section-count">{realGroups.length}</span>
                )}
              </span>
              <span className="chevron">
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  width="20"
                  height="20"
                  style={{
                    transform: isGroupsOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s",
                  }}
                >
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              </span>
            </div>
            {isGroupsOpen && (
              <div className="group-sort-bar" onClick={(e) => e.stopPropagation()}>
                <select
                  className="group-sort-select"
                  value={groupSortBy}
                  onChange={(e) => onSortChange(e.target.value)}
                >
                  <option value="time">ส่งล่าสุด</option>
                  <option value="time-asc">ส่งเก่าสุด</option>
                  <option value="name">ชื่อ ก→ฮ A→Z</option>
                  <option value="name-desc">ชื่อ ฮ→ก Z→A</option>
                </select>
              </div>
            )}

            {isGroupsOpen && (
              <div className="group-list">
                {/* กรองกลุ่มตาม label ที่เลือก (ถ้า selectedLabel = null = ทั้งหมด) */}
                {(() => {
                  const filtered = selectedLabel === null
                    ? realGroups
                    : realGroups.filter((g) =>
                        labels.find((l) => l.id === selectedLabel)?.groupIds.includes(g.groupId)
                      );

                  if (filtered.length === 0) {
                    return (
                      <div className="empty-groups">
                        {selectedLabel === null ? 'ยังไม่มีกลุ่ม' : 'ยังไม่มีกลุ่มใน label นี้'}
                      </div>
                    );
                  }

                  return filtered.map((g) => (
                    <div key={g.groupId} className="group-btn-wrap">
                      {/* ปุ่มหลักเลือกกลุ่ม — ไม่มีปุ่มซ้อนอยู่ข้างใน */}
                      <button
                        className={`group-btn ${selectedGroup === g.groupId ? "active" : ""}`}
                        onClick={() => onSelectGroup(g.groupId)}
                      >
                        {g.pictureUrl ? (
                          <img className="group-avatar group-avatar--img" src={g.pictureUrl} alt={g.groupName} />
                        ) : (
                          <div className="group-avatar" style={{ background: getColor(g.groupName) }}>
                            {getInitials(g.groupName)}
                          </div>
                        )}
                        <span className="group-name">{g.groupName}</span>
                        {/* จุดสีแสดง label ที่กลุ่มนี้มี */}
                        <span className="group-label-dots">
                          {labels
                            .filter((l) => l.groupIds.includes(g.groupId))
                            .map((l) => (
                              <span key={l.id} className="group-label-dot" style={{ background: l.color }} title={l.name} />
                            ))}
                        </span>
                      </button>

                      {/* ปุ่มไอคอน tag — อยู่นอก group-btn เป็น sibling, position absolute */}
                      <button
                        className="btn-label-tag"
                        title="จัดการ label"
                        onClick={(e) => {
                          e.stopPropagation(); // ป้องกัน document listener ปิดก่อน toggle ทำงาน
                          setOpenLabelMenu((prev) => prev === g.groupId ? null : g.groupId);
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                          <path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z" />
                        </svg>
                      </button>

                      {/* Dropdown เลือก label สำหรับกลุ่มนี้ */}
                      {openLabelMenu === g.groupId && (
                        <div
                          className="label-dropdown"
                          // หยุด event ไม่ให้ขึ้นไปถึง document listener (ไม่งั้นจะปิดเองทันที)
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="label-dropdown-title">เลือก label</div>
                          {labels.length === 0 && (
                            <div className="label-dropdown-empty">ยังไม่มี label — กด + เพื่อสร้าง</div>
                          )}
                          {labels.map((l) => {
                            const isOn = l.groupIds.includes(g.groupId);
                            return (
                              <button
                                key={l.id}
                                className={`label-dropdown-item ${isOn ? 'label-dropdown-item--on' : ''}`}
                                onClick={() => handleToggleGroupLabel(l.id, g.groupId)}
                              >
                                <span className="label-dropdown-dot" style={{ background: l.color }} />
                                <span>{l.name}</span>
                                {isOn && <span className="label-dropdown-check">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* ── แชทส่วนตัว ── */}
          {privateChats.length > 0 && (
            <div className="section is-open">
              <div className="section-header-clickable">
                <span className="section-title">
                  ส่วนตัว
                  <span className="section-count">{privateChats.length}</span>
                </span>
              </div>
              <div className="group-list">
                {privateChats.map((g) => (
                  <button
                    key={g.groupId}
                    className={`group-btn ${selectedGroup === g.groupId ? "active" : ""}`}
                    onClick={() => onSelectGroup(g.groupId)}
                  >
                    {g.pictureUrl ? (
                      <img className="group-avatar group-avatar--img" src={g.pictureUrl} alt={g.groupName} />
                    ) : (
                      <div className="group-avatar" style={{ background: getColor(g.groupName) }}>
                        {getInitials(g.groupName)}
                      </div>
                    )}
                    <span className="group-name">{g.groupName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <button
            className="btn-drive-sidebar"
            onClick={() => { onOpenDriveFiles?.(); onClose(); }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z" />
            </svg>
            Google Drive
          </button>
        </div>
      </aside>
    </>
  );
}
