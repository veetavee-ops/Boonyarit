import { useState, useEffect, useRef, useCallback } from "react";
import {
  getInitials,
  getColor,
} from "../../utils/helpers";
import { fetchLabels, createLabel, deleteLabel, assignGroup, unassignGroup } from "../../api/labels";
import "./Sidebar.css";

// สีที่เลือกได้สำหรับ label
const LABEL_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
];

export default function Sidebar({
  isOpen,
  onClose,
  selectedGroup,
  realGroups,
  privateChats = [],
  groupSortBy,
  onSortChange,
  onSelectGroup,
  onOpenDriveFiles,
  onOpenPaymentVerification,
  onPinChange,
}) {
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

  // ปักหมุด: ค่าเริ่มต้นคือ "ปักไว้" (ฝังเป็น sidebar ปกติ ไม่ลอย) ยกเว้นผู้ใช้เคยกด unpin ไว้ก่อนหน้า
  // ถ้าปักไว้ จะไม่ auto-hide ตอนเมาส์ออก (จำค่าไว้ข้ามเซสชันด้วย localStorage)
  const [isPinned, setIsPinned] = useState(() => {
    const stored = localStorage.getItem("sidebarPinned");
    return stored === null ? true : stored === "true";
  });
  // hover peek: เมาส์ชนขอบซ้ายจอ → โผล่มาเอง, เมาส์ออก → หดกลับ (ถ้าไม่ได้ปักหมุด)
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
      localStorage.setItem("sidebarPinned", String(next));
      // เพิ่งเลิกปักหมุด แต่เมาส์ยังอยู่บน panel นี้ (เพิ่งกดปุ่มในนี้เอง)
      // → ถือว่ากำลัง hover อยู่ก่อน รอเมาส์ออกจริงๆ ค่อย auto-hide แทนที่จะหายวับทันที
      if (!next) setIsHovering(true);
      return next;
    });
  };

  useEffect(() => cancelHoverHide, []);

  // แจ้ง parent ว่าตอนนี้ปักหมุดอยู่กว้างเท่าไหร่ — เอาไปบีบพื้นที่แชทให้แคบลง
  // จะได้ไม่ลอยทับบังข้อความฝั่งซ้าย (ตอนไม่ได้ปักหมุด ลอยทับได้ปกติ)
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

  const [isGroupsOpen, setIsGroupsOpen] = useState(true);

  return (
    <>
      {/* แถบบางๆ ชิดขอบซ้ายจอ — เอาเมาส์ไปชนแล้วเมนูจะโผล่มาเอง (เฉพาะตอนที่ยังไม่เปิดอยู่) */}
      <div
        className="sidebar-hover-trigger"
        onMouseEnter={handleHoverEnter}
        onMouseLeave={handleHoverLeave}
      />
      <div
        className={`sidebar-overlay ${isOpen && !isPinned ? "active" : ""}`}
        onClick={onClose}
      />
      <aside
        className={`sidebar ${visible ? "active" : ""}${isPinned ? " sidebar--pinned" : ""}`}
        style={{ width: sidebarWidth, left: visible ? 0 : -sidebarWidth }}
        onMouseEnter={handleHoverEnter}
        onMouseLeave={handleHoverLeave}
      >
        <div
          className="sidebar-resize-handle"
          onMouseDown={onResizeMouseDown}
        />
        <div className="sidebar-header">
          <button
            className={`sidebar-pin-btn${isPinned ? " sidebar-pin-btn--active" : ""}`}
            onClick={togglePin}
            title={isPinned ? "เลิกปักหมุด" : "ปักหมุดเมนูไว้"}
            aria-label={isPinned ? "เลิกปักหมุด" : "ปักหมุดเมนูไว้"}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
            </svg>
          </button>
          <div className="sidebar-brand">
            <div>
              <div className="sidebar-brand-title">กลุ่มแชท</div>
              <div className="sidebar-brand-sub">รายชื่อกลุ่มและ label</div>
            </div>
          </div>
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
          {onOpenPaymentVerification && (
            <button
              className="btn-drive-sidebar"
              onClick={() => { onOpenPaymentVerification(); onClose(); }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              ตรวจสอบการโอนเงิน
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
