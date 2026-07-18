import { useState, useEffect, useRef, useCallback } from "react";
import { fetchAvailableDates, fetchActiveGroups } from "../../api/messages";
import { fetchAiProviders, createAiProvider, updateAiProvider, deleteAiProvider, testAiProvider, updateProviderPriority } from "../../api/aiProviders";
import { formatDateOptionLabel, getInitials, getColor } from "../../utils/helpers";
import "./SummarySidebar.css";

const RANGE_VALUES = [1, 2, 3, 5, 7, 14, 30, 60, 90];
const RANGE_UNITS = [
  { value: "day", label: "วัน" },
  { value: "month", label: "เดือน" },
  { value: "year", label: "ปี" },
];

// Sidebar ด้านขวา — รีดีไซน์ให้เป็นการ์ดแยกหมวดหมู่ชัดเจนขึ้น (ช่วงเวลา / ขอบเขต / โมเดล AI)
// ทำงานเหมือน sidebar ซ้ายทุกอย่าง (ปักหมุด/hover-peek/resize) แค่ยึดขอบขวาแทน
// หมายเหตุ: เวอร์ชันก่อนรีดีไซน์ถูกแช่แข็งไว้ที่ ../SummarySidebarLegacy/ เผื่อต้อง rollback ด่วน
export default function SummarySidebar({
  isOpen,
  onClose,
  refreshKey,
  selectedDate,
  onSelectDate,
  onSummarizeDay,
  onRangeChange,
  aiProvider = 'auto',
  onAiProviderChange,
  onPinChange,
  isSuperuser = false,
}) {
  const [dates, setDates] = useState([]);
  const [loadingDates, setLoadingDates] = useState(true);
  const [activeGroups, setActiveGroups] = useState([]);
  const [summarizeGroupId, setSummarizeGroupId] = useState("all");
  // เปิด/ปิด dropdown เลือกกลุ่ม (แบบ custom เพื่อโชว์ไอคอนกลุ่มได้ — native <select> ใส่รูปไม่ได้)
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);

  // ── AI provider ที่ user เพิ่มเอง (custom, นอกเหนือจาก Groq/Gemini built-in) ──
  const [customProviders, setCustomProviders] = useState([]);
  const [showProviderManager, setShowProviderManager] = useState(false);
  // editingProviderId: null = กำลังเพิ่มใหม่, มีค่า = กำลังแก้ไข provider ตัวนั้นอยู่
  const [editingProviderId, setEditingProviderId] = useState(null);
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderBaseUrl, setNewProviderBaseUrl] = useState('');
  const [newProviderApiKey, setNewProviderApiKey] = useState('');
  const [newProviderModel, setNewProviderModel] = useState('');
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerError, setProviderError] = useState('');
  // ผลทดสอบการเชื่อมต่อของฟอร์มที่กำลังกรอกอยู่ — { status: 'testing'|'ok'|'error', message }
  const [draftTestResult, setDraftTestResult] = useState(null);
  const [draftTesting, setDraftTesting] = useState(false);
  // ผลทดสอบรายแถวของ provider ที่บันทึกไว้แล้ว — key เป็น provider id
  const [rowTestResults, setRowTestResults] = useState({});
  const [rowTestingId, setRowTestingId] = useState(null);

  const loadCustomProviders = useCallback(() => {
    fetchAiProviders()
      .then((data) => setCustomProviders(Array.isArray(data) ? data : []))
      .catch(() => setCustomProviders([]));
  }, []);

  useEffect(() => { loadCustomProviders(); }, [loadCustomProviders]);

  // ตัวเลือกในdropdown: "อัตโนมัติ" (ไล่ตามลำดับความสำคัญ) + provider ทุกตัวในระบบ (Groq/Gemini/custom
  // รวมเป็นรายการเดียวกันหมดแล้ว ไม่แยก built-in อีกต่อไป — เรียงตาม priority ที่ backend ส่งมา)
  const allAiOptions = [
    { value: 'auto', label: 'อัตโนมัติ (ตามลำดับความสำคัญ)', icon: '🎯' },
    ...customProviders.map((p) => ({
      value: String(p.id),
      label: p.name,
      sub: p.model,
      icon: p.isBuiltIn ? '⚡' : '🔧',
      id: p.id,
    })),
  ];
  const selectedAiOption = allAiOptions.find((o) => o.value === aiProvider);
  const editingProvider = customProviders.find((p) => p.id === editingProviderId);

  const resetProviderForm = () => {
    setEditingProviderId(null);
    setNewProviderName('');
    setNewProviderBaseUrl('');
    setNewProviderApiKey('');
    setNewProviderModel('');
    setProviderError('');
    setDraftTestResult(null);
  };

  // เปิดฟอร์มเปล่าสำหรับเพิ่ม provider ใหม่ (กด "+" ที่หัวการ์ด)
  const handleOpenAddProvider = () => {
    resetProviderForm();
    setShowProviderManager((v) => !v);
  };

  // เปิดฟอร์มพร้อม prefill ข้อมูลเดิมสำหรับแก้ไข (กด ✎ ที่รายการ) — apiKey เว้นว่างไว้เสมอ
  // เพราะ backend ส่งมาแค่ค่า mask ไม่มีทางรู้คีย์เต็ม ถ้าไม่กรอกใหม่ = ใช้คีย์เดิมต่อ
  const handleStartEditProvider = (p) => {
    setEditingProviderId(p.id);
    setNewProviderName(p.name);
    setNewProviderBaseUrl(p.baseUrl);
    setNewProviderApiKey('');
    setNewProviderModel(p.model);
    setProviderError('');
    setDraftTestResult(null);
    setShowProviderManager(true);
  };

  // ทดสอบค่าที่กำลังกรอกในฟอร์ม (ยังไม่ต้องบันทึกก่อนก็ทดสอบได้) — ถ้าแก้ไขอยู่และเว้น apiKey ว่าง
  // จะส่ง id ไปด้วยให้ backend fallback ไปใช้คีย์เดิมที่บันทึกไว้แทน
  const handleTestDraft = async () => {
    if (!newProviderBaseUrl.trim() || !newProviderModel.trim() || (!editingProviderId && !newProviderApiKey.trim())) {
      setDraftTestResult({ status: 'error', message: 'กรอก Base URL, Model และ API Key ก่อนทดสอบ' });
      return;
    }
    setDraftTesting(true);
    setDraftTestResult(null);
    try {
      const result = await testAiProvider({
        ...(editingProviderId ? { id: editingProviderId } : {}),
        baseUrl: newProviderBaseUrl.trim(),
        model: newProviderModel.trim(),
        ...(newProviderApiKey.trim() ? { apiKey: newProviderApiKey.trim() } : {}),
      });
      setDraftTestResult(
        result.ok
          ? { status: 'ok', message: `เชื่อมต่อสำเร็จ — AI ตอบ: "${result.reply}"` }
          : { status: 'error', message: result.error }
      );
    } catch (err) {
      setDraftTestResult({ status: 'error', message: err.response?.data?.error || err.message });
    } finally {
      setDraftTesting(false);
    }
  };

  // ทดสอบ provider ที่บันทึกไว้แล้วโดยตรงจากรายการ (ไม่ต้องเปิดฟอร์มแก้ไข)
  const handleTestSavedProvider = async (id) => {
    setRowTestingId(id);
    setRowTestResults((prev) => ({ ...prev, [id]: null }));
    try {
      const result = await testAiProvider({ id });
      setRowTestResults((prev) => ({
        ...prev,
        [id]: result.ok
          ? { status: 'ok', message: `สำเร็จ: "${result.reply}"` }
          : { status: 'error', message: result.error },
      }));
    } catch (err) {
      setRowTestResults((prev) => ({ ...prev, [id]: { status: 'error', message: err.response?.data?.error || err.message } }));
    } finally {
      setRowTestingId(null);
    }
  };

  const handleSaveProvider = async () => {
    const isEditing = editingProviderId !== null;
    const apiKeyRequired = !isEditing; // ตอนเพิ่มใหม่ต้องกรอก, ตอนแก้ไขเว้นว่างได้ (ใช้คีย์เดิม)
    if (!newProviderName.trim() || !newProviderBaseUrl.trim() || !newProviderModel.trim() || (apiKeyRequired && !newProviderApiKey.trim())) {
      setProviderError('กรอกให้ครบทุกช่อง');
      return;
    }
    setProviderSaving(true);
    setProviderError('');
    try {
      const payload = {
        name: newProviderName.trim(),
        baseUrl: newProviderBaseUrl.trim(),
        model: newProviderModel.trim(),
        ...(newProviderApiKey.trim() ? { apiKey: newProviderApiKey.trim() } : {}),
      };
      if (isEditing) {
        const updated = await updateAiProvider(editingProviderId, payload);
        setCustomProviders((prev) => prev.map((p) => (p.id === editingProviderId ? updated : p)));
      } else {
        const created = await createAiProvider(payload);
        setCustomProviders((prev) => [...prev, created]);
      }
      resetProviderForm();
    } catch (err) {
      setProviderError(err.response?.data?.error || (isEditing ? 'แก้ไข provider ไม่สำเร็จ' : 'เพิ่ม provider ไม่สำเร็จ'));
    } finally {
      setProviderSaving(false);
    }
  };

  const handleDeleteProvider = async (id) => {
    try {
      await deleteAiProvider(id);
      // backend ปิดช่องว่างลำดับความสำคัญของตัวที่เหลือให้อัตโนมัติหลังลบ — โหลดรายการใหม่ทั้งชุด
      // แทนการ filter local เฉยๆ จะได้เลข priority ที่ตรงกับ backend จริง
      loadCustomProviders();
      // ถ้ากำลังเลือก provider ที่เพิ่งลบอยู่ ให้สลับกลับไปโหมดอัตโนมัติ
      if (aiProvider === String(id)) onAiProviderChange?.('auto');
      // ถ้ากำลังแก้ไข provider ตัวที่เพิ่งลบอยู่พอดี ให้เคลียร์ฟอร์มด้วย
      if (editingProviderId === id) resetProviderForm();
    } catch (err) {
      alert('ลบ provider ไม่สำเร็จ: ' + (err.response?.data?.error || err.message));
    }
  };

  // จัดลำดับความสำคัญ — พิมพ์เลขใหม่ในช่อง แล้ว blur/Enter จะสลับตำแหน่งกับตัวที่ถือเลขนั้นอยู่เดิม
  const handleChangePriority = async (id, newPriority) => {
    try {
      const updatedList = await updateProviderPriority(id, newPriority);
      setCustomProviders(updatedList);
    } catch (err) {
      alert('จัดลำดับไม่สำเร็จ: ' + (err.response?.data?.error || err.message));
    }
  };

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
          <div className="summary-sidebar-header-icon">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
            </svg>
          </div>
          <div className="summary-sidebar-brand">
            <div className="summary-sidebar-brand-title">ตั้งค่าการสรุป AI</div>
            <div className="summary-sidebar-brand-sub">เลือกช่วงเวลาและวันที่</div>
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
          {/* ── การ์ด: ช่วงเวลา ── */}
          <div className="ai-card">
            <div className="ai-card-title">
              <span className="ai-card-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                  <path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z" />
                </svg>
              </span>
              ช่วงเวลา
            </div>

            <label className="ai-field-label">ย้อนหลัง</label>
            <div className="range-filter-row">
              <select
                className="ai-select ai-select--narrow"
                value={rangeValue}
                onChange={(e) => setRangeValue(Number(e.target.value))}
              >
                {RANGE_VALUES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <select
                className="ai-select ai-select--narrow"
                value={rangeUnit}
                onChange={(e) => setRangeUnit(e.target.value)}
              >
                {RANGE_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>

            <label htmlFor="summary-date-select" className="ai-field-label">
              วันที่สรุป {loadingDates ? "…" : ""}
            </label>
            <select
              id="summary-date-select"
              className="ai-select"
              value={selectedDate}
              onChange={(e) => onSelectDate(e.target.value)}
              disabled={loadingDates}
            >
              <option value="all">ทั้งหมด ({dates.length} วัน)</option>
              {dates.map((d) => (
                <option key={d} value={d}>{formatDateOptionLabel(d)}</option>
              ))}
            </select>
            <div className="ai-hint">เลือกวันเพื่อให้ AI สรุปแชทของวันนั้น</div>
          </div>

          {/* ── การ์ด: ขอบเขต (กลุ่มที่จะสรุป) ── */}
          <div className="ai-card">
            <div className="ai-card-title">
              <span className="ai-card-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                </svg>
              </span>
              ขอบเขต
            </div>

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

          {/* ── การ์ด: โมเดล AI ── */}
          <div className="ai-card">
            <div className="ai-card-title">
              <span className="ai-card-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
                </svg>
              </span>
              โมเดล AI
              {isSuperuser && (
                <button
                  type="button"
                  className="ai-card-title-add"
                  title="เพิ่ม AI provider ใหม่"
                  onClick={handleOpenAddProvider}
                >+</button>
              )}
            </div>

            <select
              className="ai-select"
              value={aiProvider}
              onChange={(e) => onAiProviderChange?.(e.target.value)}
            >
              {allAiOptions.map((p) => (
                <option key={p.value} value={p.value}>{p.icon} {p.label}{p.sub ? ` (${p.sub})` : ''}</option>
              ))}
            </select>

            {/* ── ฟอร์มเพิ่ม/จัดการ custom AI provider (superuser เท่านั้น) ── */}
            {isSuperuser && showProviderManager && (
              <div className="ai-provider-manager">
                {customProviders.length > 0 && (
                  <div className="ai-provider-list">
                    {customProviders.map((p) => (
                      <div key={p.id} className="ai-provider-list-row">
                        <div className={`ai-provider-list-item${editingProviderId === p.id ? ' ai-provider-list-item--editing' : ''}`}>
                          <input
                            type="number"
                            min="1"
                            max={customProviders.length}
                            className="ai-provider-priority-input"
                            title="ลำดับความสำคัญ — พิมพ์เลขใหม่แล้วกด Enter/คลิกที่อื่นเพื่อสลับตำแหน่ง"
                            key={`${p.id}-${p.priority}`}
                            defaultValue={p.priority}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (val && val !== p.priority) handleChangePriority(p.id, val);
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                          />
                          {p.isBuiltIn && <span className="ai-provider-builtin-badge" title="built-in จาก .env">⚡</span>}
                          <span className="ai-provider-list-name">{p.name}</span>
                          <span className="ai-provider-list-model">{p.model}</span>
                          <button
                            type="button"
                            className="ai-provider-list-test"
                            title="ทดสอบการเชื่อมต่อ"
                            disabled={rowTestingId === p.id}
                            onClick={() => handleTestSavedProvider(p.id)}
                          >{rowTestingId === p.id ? '…' : '▶'}</button>
                          <button
                            type="button"
                            className="ai-provider-list-edit"
                            title="แก้ไข provider นี้"
                            onClick={() => handleStartEditProvider(p)}
                          >✎</button>
                          <button
                            type="button"
                            className="ai-provider-list-delete"
                            title="ลบ provider นี้"
                            onClick={() => handleDeleteProvider(p.id)}
                          >×</button>
                        </div>
                        {rowTestResults[p.id] && (
                          <div className={`ai-provider-test-result ai-provider-test-result--${rowTestResults[p.id].status}`}>
                            {rowTestResults[p.id].status === 'ok' ? '✓' : '✗'} {rowTestResults[p.id].message}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {editingProvider && (
                  <div className="ai-provider-editing-note">
                    กำลังแก้ไข "{editingProvider.name}" — คีย์ปัจจุบัน: <code>{editingProvider.apiKeyMasked}</code>
                  </div>
                )}

                <label className="ai-field-label">ชื่อที่แสดง (ตั้งเองได้)</label>
                <input
                  className="ai-provider-input"
                  name="ai-provider-display-name"
                  autoComplete="off"
                  placeholder="เช่น DeepSeek V3"
                  value={newProviderName}
                  onChange={(e) => setNewProviderName(e.target.value)}
                />

                <label className="ai-field-label">Base URL (จากเว็บผู้ให้บริการ)</label>
                <input
                  className="ai-provider-input"
                  name="ai-provider-base-url"
                  autoComplete="off"
                  placeholder="เช่น https://api.deepseek.com/v1"
                  value={newProviderBaseUrl}
                  onChange={(e) => setNewProviderBaseUrl(e.target.value)}
                />

                {/* autoComplete="new-password" กันเบราว์เซอร์เอารหัสผ่านที่เคยจำไว้มาเติมให้เอง
                    เพราะช่อง text ที่อยู่ก่อนหน้า password field ทันที เบราว์เซอร์มักเข้าใจผิดว่าเป็น
                    ฟอร์ม login แล้วเติม username/password ที่เคยจำไว้ให้อัตโนมัติ (ไม่ใช่ state ค้าง) */}
                <label className="ai-field-label">API Key (จากเว็บผู้ให้บริการ)</label>
                <input
                  className="ai-provider-input"
                  type="password"
                  name="ai-provider-api-key"
                  autoComplete="new-password"
                  placeholder={editingProvider ? 'เว้นว่างไว้ถ้าไม่เปลี่ยน' : 'เช่น sk-xxxxxxxxxxxxxxxx'}
                  value={newProviderApiKey}
                  onChange={(e) => setNewProviderApiKey(e.target.value)}
                />

                <label className="ai-field-label">ชื่อ Model (จากเว็บผู้ให้บริการ)</label>
                <input
                  className="ai-provider-input"
                  name="ai-provider-model"
                  autoComplete="off"
                  placeholder="เช่น deepseek-chat"
                  value={newProviderModel}
                  onChange={(e) => setNewProviderModel(e.target.value)}
                />
                <button
                  type="button"
                  className="ai-provider-test-btn"
                  onClick={handleTestDraft}
                  disabled={draftTesting}
                >{draftTesting ? 'กำลังทดสอบ...' : '🔌 ทดสอบการเชื่อมต่อ'}</button>
                {draftTestResult && (
                  <div className={`ai-provider-test-result ai-provider-test-result--${draftTestResult.status}`}>
                    {draftTestResult.status === 'ok' ? '✓' : '✗'} {draftTestResult.message}
                  </div>
                )}

                {providerError && <div className="ai-provider-error">{providerError}</div>}
                <div className="ai-provider-actions">
                  <button
                    type="button"
                    className="ai-provider-save"
                    onClick={handleSaveProvider}
                    disabled={providerSaving}
                  >{providerSaving ? 'กำลังบันทึก...' : (editingProvider ? 'บันทึกการแก้ไข' : 'บันทึก')}</button>
                  <button
                    type="button"
                    className="ai-provider-cancel"
                    onClick={() => {
                      setShowProviderManager(false);
                      resetProviderForm();
                    }}
                  >ปิด</button>
                </div>
                <div className="ai-hint">รองรับเฉพาะ endpoint แบบ OpenAI-compatible (เช่น OpenRouter, DeepSeek, Together, Ollama)</div>
              </div>
            )}
          </div>

          <button className="ai-submit-btn" onClick={() => onSummarizeDay(summarizeGroupId)}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
            </svg>
            สรุป
          </button>
          <p className="ai-submit-caption">
            สรุปโดย {selectedAiOption ? `${selectedAiOption.icon} ${selectedAiOption.label}` : aiProvider}
          </p>
        </div>
      </aside>
    </>
  );
}
