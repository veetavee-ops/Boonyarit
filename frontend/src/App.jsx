import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { checkAuth, logout, updateProfile } from "./api/auth";
import { useGroups, useMessages } from "./hooks/useMessages";
import { useSocket } from "./hooks/useSocket";
import { summarizeDay, searchMessages, toggleImportant, deleteMessages, forwardMessages, sendDirectMessage, askAssistant, checkCommand } from "./api/messages";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import DriveFilesPage from "./pages/DriveFilesPage";
import PaymentVerificationPage from "./pages/PaymentVerificationPage";
import DashboardPage from "./pages/DashboardPage";
import AdminPanel from "./pages/AdminPanel";
import Sidebar from "./components/Sidebar/Sidebar";
import SummarySidebar from "./components/SummarySidebar/SummarySidebar";
import ChatWindow from "./components/ChatWindow/ChatWindow";
import SummaryModal from "./components/SummaryModal/SummaryModal";
import ChangePasswordModal from "./components/ChangePasswordModal/ChangePasswordModal";
import MessageJumpModal from "./components/MessageJumpModal/MessageJumpModal";
import "./App.css";

// DM พิเศษสำหรับคุยกับ AI ผู้ช่วย — ไม่ใช่กลุ่ม/DM จริงใน LINE ไม่ผ่าน push เลย
const AI_ASSISTANT_GROUP = {
  groupId: 'ai-assistant',
  groupName: '🤖 AI ผู้ช่วย',
  isPrivate: true,
  isAiAssistant: true,
  pictureUrl: null,
};

export default function App() {
  // ✅ ALL hooks must be declared unconditionally before any early returns
  const [admin, setAdmin] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const today = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchDebounceRef = useRef(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dateRange, setDateRange] = useState({
    rangeValue: 7,
    rangeUnit: "day",
  });
  const [groupSortBy, setGroupSortBy] = useState("time");

  const [showDaySummary, setShowDaySummary] = useState(false);
  const [showDriveFiles, setShowDriveFiles] = useState(false);
  const [showPaymentVerification, setShowPaymentVerification] = useState(false);
  // popup "กระโดดไปข้อความ" — เปิดจากลิงก์ผลค้นหาข้อความ
  const [jumpMessageId, setJumpMessageId] = useState(null);
  // กด "เข้าห้องแชทนี้เลย" ใน popup ด้านบน — ให้ ChatWindow โหลดข้อความรอบๆ ข้อความนี้แทน "ล่าสุด"
  // แล้ว scroll+ไฮไลต์ไปหามัน (เคลียร์ทุกครั้งที่สลับกลุ่มด้วยวิธีปกติ กันค้างข้ามห้อง)
  const [chatJumpMessageId, setChatJumpMessageId] = useState(null);
  // คำค้นที่ใช้ไฮไลต์คำในข้อความจริง (ไม่ใช่แค่ในพรีวิวบับเบิลผลค้นหา) — คู่กับ jumpMessageId/
  // chatJumpMessageId ด้านบน ใช้ร่วมกันได้เพราะ MessageBubble จะไฮไลต์ก็ต่อเมื่อ msg.id ตรงกับ
  // เป้าหมายเท่านั้น (ดู ChatWindow.jsx / MessageJumpModal.jsx)
  const [highlightKeyword, setHighlightKeyword] = useState(null);
  const [daySummary, setDaySummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSummarySidebarOpen, setIsSummarySidebarOpen] = useState(false);
  const [showLogoModal, setShowLogoModal] = useState(false);
  // ปักหมุด sidebar ไว้ → ต้องบีบพื้นที่แชทให้แคบลงเท่ากับความกว้าง sidebar
  // ไม่งั้น sidebar จะลอยทับบังข้อความฝั่งซ้ายของแชท
  const [pinnedSidebarWidth, setPinnedSidebarWidth] = useState(0);
  const [pinnedSummarySidebarWidth, setPinnedSummarySidebarWidth] = useState(0);
  const [showLineIdInput, setShowLineIdInput] = useState(false);
  const [lineIdDraft, setLineIdDraft] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false); // true = กำลังเปิด modal เปลี่ยนรหัสผ่านอยู่
  const [showDashboard, setShowDashboard] = useState(false);
  const [aiProvider, setAiProvider] = useState('groq');
  // "load กี่วันย้อนหลัง" ของแชทที่เปิดอยู่ — null = โหลดทั้งหมด (ไม่จำกัดวัน) เหมือนเดิม
  const [daysBack, setDaysBack] = useState(null);

  const { groups, loading: groupsLoading } = useGroups(refreshKey);
  // ไม่ fetch ข้อความจริงสำหรับ DM ปลอม "AI ผู้ช่วย" — บทสนทนานั้นเก็บ local ใน ChatWindow เอง
  const messagesGroupId = selectedGroup === AI_ASSISTANT_GROUP.groupId ? null : selectedGroup;
  const {
    messages,
    loading: msgsLoading,
    hasMore,
    loadingMore,
    loadMore,
    addMessage,
    updateMessage,
    removeMessages,
  } = useMessages(messagesGroupId, daysBack, chatJumpMessageId);

  const handleNewMessage = useCallback(
    (newMessage) => {
      const msgGroupId = newMessage.groupId
        ? newMessage.groupId
        : `private_${newMessage.userId}`;

      // 1. If looking at this group, add message to chat window
      if (msgGroupId === selectedGroup) {
        addMessage(newMessage);
      }

      // 2. Always refresh sidebar (to show new group or update "last message")
      setRefreshKey((prev) => prev + 1);
    },
    [addMessage, selectedGroup],
  );

  // คนอื่น (หรือแท็บอื่น) ลบข้อความไป — เอาออกจาก state ทันทีถ้ากำลังดูอยู่
  const handleMessagesDeleted = useCallback(
    ({ messageIds }) => removeMessages(messageIds),
    [removeMessages],
  );

  useSocket(selectedGroup, handleNewMessage, handleMessagesDeleted);

  // ลบข้อความถาวร (เดี่ยวหรือหลายอัน) — เรียกจาก ChatWindow ตอนกดยืนยันลบ
  const handleDeleteMessages = async (messageIds) => {
    await deleteMessages(messageIds);
    removeMessages(messageIds);
  };

  // ส่งต่อข้อความที่เลือกไปยังกลุ่ม/DM อื่นใน LINE — เรียกจาก ChatWindow ตอนกดยืนยันส่งต่อ
  const handleForwardMessages = async (messageIds, targetGroupId) => {
    return await forwardMessages(messageIds, targetGroupId);
  };

  // พิมพ์ข้อความส่งตรงเข้าห้อง LINE — เรียกจาก ChatWindow ตอนกดยืนยันส่ง
  const handleSendDirectMessage = async (groupId, text) => {
    return await sendDirectMessage(groupId, text);
  };

  // ถาม AI ผู้ช่วยผ่าน dashboard โดยตรง — เรียกจาก ChatWindow ตอนพิมพ์ใน DM "AI ผู้ช่วย"
  const handleAskAssistant = async (text) => {
    return await askAssistant(text);
  };

  // เช็คว่าข้อความที่พิมพ์ในห้องแชทจริงตรงคำสั่ง "ค้นหา"/"สรุปเลย" ไหม — เรียกจาก ChatWindow ก่อนตัดสินใจ
  // ว่าจะ push เข้า LINE จริงหรือตอบในเครื่องเฉยๆ
  const handleCheckCommand = async (groupId, text) => {
    return await checkCommand(groupId, text);
  };

  // กดลิงก์ "เข้าห้องแชทนี้เลย" จากผลค้นหา (ทั้งกดตรงชื่อกลุ่มในบับเบิล และกดหัว popup กระโดดไปข้อความ)
  // สลับกลุ่ม + สั่งให้ ChatWindow โหลดข้อความรอบๆ ข้อความนั้นแทน "ล่าสุด" แล้ว scroll+ไฮไลต์ให้เอง
  const handleOpenMessageInChat = (groupId, messageId, highlight) => {
    setSelectedGroup(groupId);
    setChatJumpMessageId(messageId);
    setHighlightKeyword(highlight || null);
    setJumpMessageId(null);
    setSearch('');
  };

  useEffect(() => {
    clearTimeout(searchDebounceRef.current);
    if (search.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      const data = await searchMessages(search.trim());
      setSearchResults(data);
      setSearching(false);
    }, 350);
  }, [search]);

  useEffect(() => {
    checkAuth()
      .then((admin) => {
        setAdmin(admin);
        setRefreshKey((prev) => prev + 1);
      })
      .catch(() => {
        setAdmin(null);
      })
      .finally(() => {
        setAuthLoading(false);
      });
  }, []);

  useEffect(() => {
    const groupsList = Array.isArray(groups) ? groups : [];
    if (!selectedGroup && groupsList.length > 0 && !groupsLoading) {
      setSelectedGroup(groupsList[0].groupId);
    }
  }, [groups, groupsLoading, selectedGroup]);

  // 🔒 Check for hidden registration route (Simple Router) — AFTER all hooks
  if (window.location.pathname === "/register-admin") {
    return <RegisterPage />;
  }

  // หน้า "ลืมรหัสผ่าน" และ "ตั้งรหัสผ่านใหม่" ต้องเข้าได้แม้ยังไม่ได้ล็อกอิน (เพราะ user ลืมรหัสผ่าน = ล็อกอินไม่ได้อยู่แล้ว)
  // เลยเช็ค pathname ตรงนี้ ก่อนจะถึงจุดที่เช็คว่า login อยู่ไหม (เหมือนกับ /register-admin ด้านบน)
  if (window.location.pathname === "/forgot-password") {
    return <ForgotPasswordPage onBack={() => { window.location.href = "/"; }} />;
  }
  if (window.location.pathname === "/reset-password") {
    return <ResetPasswordPage />;
  }

  const handleLogin = (adminData) => {
    setAdmin(adminData);
    // เหมือน checkAuth() ตอน hard refresh — ต้อง bump refreshKey ด้วย ไม่งั้น useGroups
    // จะไม่ fetch ใหม่ ทำให้เห็นรายชื่อกลุ่ม/DM ค้างจาก account เดิมก่อนหน้า (ถ้ามี)
    setRefreshKey((prev) => prev + 1);
  };

  const handleLogout = async () => {
    await logout();
    setAdmin(null);
    setSelectedGroup(null);
  };

  const handleSaveLineId = async () => {
    try {
      await updateProfile({ lineUserId: lineIdDraft.trim() || null });
      setAdmin((prev) => ({ ...prev, lineUserId: lineIdDraft.trim() || null }));
      setShowLineIdInput(false);
    } catch (e) {
      console.error('Failed to update LINE ID:', e);
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  const toggleSummarySidebar = () => {
    setIsSummarySidebarOpen((prev) => !prev);
  };

  const closeSummarySidebar = () => {
    setIsSummarySidebarOpen(false);
  };

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!admin) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (window.location.pathname === "/admin-panel") {
    return admin.role === 'superuser' ? <AdminPanel /> : <div style={{padding:'2rem',color:'white'}}>ไม่มีสิทธิ์เข้าถึง</div>;
  }

  const handleSummarizeDay = async (summarizeGroupId = null) => {
    setShowDaySummary(true);
    setSummaryLoading(true);
    setSummaryError(null);
    setDaySummary(null);

    try {
      const result = await summarizeDay(
        selectedDate,
        selectedDate === "all" ? dateRange : null,
        summarizeGroupId,
        aiProvider,
      );
      setDaySummary(result);
    } catch (error) {
      setSummaryError(error.message);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleToggleImportant = async (messageId) => {
    try {
      const result = await toggleImportant(messageId);
      updateMessage(messageId, { isImportant: result.isImportant });
      return result;
    } catch (err) {
      console.error('Failed to toggle important:', err);
    }
  };

  const groupsList = Array.isArray(groups) ? groups : [];
  // Dedup by groupId only — backend already groups by displayName
  const uniqueGroups = groupsList.filter(
    (g, i, arr) => arr.findIndex((x) => x.groupId === g.groupId) === i,
  );
  const currentGroup =
    selectedGroup === AI_ASSISTANT_GROUP.groupId
      ? AI_ASSISTANT_GROUP
      : uniqueGroups.find((g) => g.groupId === selectedGroup);
  const privateChats = [AI_ASSISTANT_GROUP, ...uniqueGroups.filter((g) => g.isPrivate)];
  const thCollator = new Intl.Collator("th", { sensitivity: "base", numeric: true });
  const realGroups = uniqueGroups
    .filter((g) => !g.isPrivate)
    .sort((a, b) => {
      if (groupSortBy === "name")
        return thCollator.compare(a.groupName || "", b.groupName || "");
      if (groupSortBy === "name-desc")
        return thCollator.compare(b.groupName || "", a.groupName || "");
      if (groupSortBy === "time-asc")
        return new Date(a.lastMessageTime) - new Date(b.lastMessageTime);
      return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
    });

  if (groupsLoading && groupsList.length === 0) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-header">
        <div className="header-left-controls">
          <button
            className="menu-btn"
            onClick={toggleSidebar}
            aria-label="กลุ่มแชท"
            title="กลุ่มแชท"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="19" height="19">
              <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" />
            </svg>
          </button>
          <button
            className={`btn-header-icon${showDashboard ? ' active' : ''}`}
            onClick={() => setShowDashboard((v) => !v)}
            title="ภาพรวม"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
            </svg>
          </button>
        </div>
        <div className="header-brand">
          <img
            className="header-brand-photo"
            src="/favicon.png"
            alt="Boonyarit"
            width="24"
            height="24"
            role="button"
            tabIndex={0}
            onClick={() => setShowLogoModal(true)}
          />
          <span className="header-brand-icon">
            <svg viewBox="0 0 24 24" fill="white" width="18" height="18">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
            </svg>
          </span>
          <span className="header-brand-name">Boonyarit</span>
        </div>
        <div className="user-info">
          {admin.role === 'superuser' && (
            <button className="btn-header-icon" onClick={() => window.location.href = '/admin-panel'} title="จัดการผู้ใช้">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
              <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10" style={{marginLeft:'-4px'}}>
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
            </button>
          )}
          <div className="user-chip">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            </svg>
            <span>{admin.username}</span>
          </div>
          {/* ปุ่มเปิด sidebar ขวา — ตั้งค่าการสรุป AI (ย้ายมาจาก sidebar ซ้ายเดิม) */}
          <button
            className="btn-header-icon"
            onClick={toggleSummarySidebar}
            aria-label="ตั้งค่าการสรุป AI"
            title="ตั้งค่าการสรุป AI"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
            </svg>
          </button>
          {/* ปุ่มเปิด modal ตั้งค่าบัญชี (อีเมลกู้คืนรหัสผ่าน + เปลี่ยนรหัสผ่าน) — แค่เซ็ต state เป็น true ตัว modal ก็จะโผล่มาเอง (ดูด้านล่างสุดของ JSX) */}
          <button
            className="btn-header-icon"
            onClick={() => setShowChangePassword(true)}
            title="ตั้งค่าบัญชี"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
            </svg>
          </button>
          <button onClick={handleLogout} className="btn-logout">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
            </svg>
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </div>

      <div
        className="app-body"
        style={{
          ...(pinnedSidebarWidth ? { paddingLeft: pinnedSidebarWidth + 12 } : {}),
          ...(pinnedSummarySidebarWidth ? { paddingRight: pinnedSummarySidebarWidth + 12 } : {}),
        }}
      >
        {showDashboard ? (
          <DashboardPage
            onSelectGroup={(groupId) => {
              setSelectedGroup(groupId);
              setChatJumpMessageId(null);
              setShowDashboard(false);
            }}
          />
        ) : (
          <ChatWindow
            currentGroup={currentGroup}
            messages={messages}
            loading={msgsLoading}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            search={search}
            onSearchChange={setSearch}
            searchResults={searchResults}
            searching={searching}
            onSelectGroup={(groupId) => { setSelectedGroup(groupId); setChatJumpMessageId(null); setSearch(''); }}
            onToggleImportant={handleToggleImportant}
            myLineUserId={admin.lineUserId}
            daysBack={daysBack}
            onDaysBackChange={setDaysBack}
            onDeleteMessages={handleDeleteMessages}
            groups={uniqueGroups}
            onForwardMessages={handleForwardMessages}
            canSendDirect={['superuser', 'admin'].includes(admin.role)}
            onSendDirectMessage={handleSendDirectMessage}
            onAskAssistant={handleAskAssistant}
            onCheckCommand={handleCheckCommand}
            onJumpToMessage={(groupId, messageId, highlight) => {
              setJumpMessageId(messageId);
              setHighlightKeyword(highlight || null);
            }}
            onJumpToMessageDirect={handleOpenMessageInChat}
            scrollToMessageId={chatJumpMessageId}
            highlightKeyword={highlightKeyword}
          />
        )}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={closeSidebar}
          selectedGroup={selectedGroup}
          realGroups={realGroups}
          privateChats={privateChats}
          groupSortBy={groupSortBy}
          onSortChange={setGroupSortBy}
          onSelectGroup={(groupId) => {
            setSelectedGroup(groupId);
            setChatJumpMessageId(null);
            closeSidebar();
          }}
          onOpenDriveFiles={() => setShowDriveFiles(true)}
          onOpenPaymentVerification={admin?.role === 'superuser' ? () => setShowPaymentVerification(true) : undefined}
          onPinChange={setPinnedSidebarWidth}
        />
        <SummarySidebar
          isOpen={isSummarySidebarOpen}
          onClose={closeSummarySidebar}
          refreshKey={refreshKey}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onSummarizeDay={handleSummarizeDay}
          onRangeChange={setDateRange}
          aiProvider={aiProvider}
          onAiProviderChange={setAiProvider}
          onPinChange={setPinnedSummarySidebarWidth}
        />
      </div>

      {showDaySummary && (
        <SummaryModal
          summary={daySummary}
          loading={summaryLoading}
          error={summaryError}
          onClose={() => setShowDaySummary(false)}
        />
      )}

      {showDriveFiles && (
        <DriveFilesPage onClose={() => setShowDriveFiles(false)} />
      )}

      {showPaymentVerification && (
        <PaymentVerificationPage onClose={() => setShowPaymentVerification(false)} />
      )}

      {jumpMessageId && (
        <MessageJumpModal
          messageId={jumpMessageId}
          onClose={() => setJumpMessageId(null)}
          myLineUserId={admin.lineUserId}
          onOpenInChat={handleOpenMessageInChat}
          highlightKeyword={highlightKeyword}
        />
      )}

      {/* modal เปลี่ยนรหัสผ่าน — เด้งขึ้นมาก็ต่อเมื่อ showChangePassword เป็น true เท่านั้น */}
      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          currentEmail={admin.email}
          onEmailSaved={(email) => setAdmin((prev) => ({ ...prev, email }))}
        />
      )}

      {/* modal ขยายรูปโลโก้ — กดที่รูปเล็กบน header แล้วเด้งรูปใหญ่ พร้อมลิงก์ไป achalee.com */}
      {showLogoModal && (
        <div className="logo-modal-overlay" onClick={() => setShowLogoModal(false)}>
          <div className="logo-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="logo-modal-close"
              onClick={() => setShowLogoModal(false)}
              aria-label="ปิด"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
            <img className="logo-modal-img" src="/favicon.png" alt="Boonyarit" />
            <a
              className="logo-modal-link"
              href="https://achalee.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              achalee.com
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
