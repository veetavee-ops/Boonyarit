import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { checkAuth, logout } from "./api/auth";
import { useGroups, useMessages } from "./hooks/useMessages";
import { useSocket } from "./hooks/useSocket";
import { summarizeDay, searchMessages, toggleImportant } from "./api/messages";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DriveFilesPage from "./pages/DriveFilesPage";
import DashboardPage from "./pages/DashboardPage";
import AdminPanel from "./pages/AdminPanel";
import Sidebar from "./components/Sidebar/Sidebar";
import ChatWindow from "./components/ChatWindow/ChatWindow";
import SummaryModal from "./components/SummaryModal/SummaryModal";
import "./App.css";

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
  const [daySummary, setDaySummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [aiProvider, setAiProvider] = useState('groq');

  const { groups, loading: groupsLoading } = useGroups(refreshKey);
  const {
    messages,
    loading: msgsLoading,
    hasMore,
    loadingMore,
    loadMore,
    addMessage,
    updateMessage,
  } = useMessages(selectedGroup);

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

  useSocket(selectedGroup, handleNewMessage);

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

  if (window.location.pathname === "/drive-files") {
    return <DriveFilesPage />;
  }

  const handleLogin = (adminData) => {
    setAdmin(adminData);
  };

  const handleLogout = async () => {
    await logout();
    setAdmin(null);
  };

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
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
  const currentGroup = uniqueGroups.find((g) => g.groupId === selectedGroup);
  const privateChats = uniqueGroups.filter((g) => g.isPrivate);
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
          <span className="header-brand-icon">
            <svg viewBox="0 0 24 24" fill="white" width="18" height="18">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
            </svg>
          </span>
          <span className="header-brand-name">Boonyarit LINE OA</span>
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
          <button onClick={handleLogout} className="btn-logout">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
            </svg>
            <span>ออกจากระบบ</span>
          </button>
          <button
            className="menu-btn"
            onClick={toggleSidebar}
            aria-label="เปิดเมนู"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="app-body">
        {showDashboard ? (
          <DashboardPage
            onSelectGroup={(groupId) => {
              setSelectedGroup(groupId);
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
            onSelectGroup={(groupId) => { setSelectedGroup(groupId); setSearch(''); }}
            onToggleImportant={handleToggleImportant}
          />
        )}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={closeSidebar}
          refreshKey={refreshKey}
          selectedDate={selectedDate}
          selectedGroup={selectedGroup}
          realGroups={realGroups}
          privateChats={privateChats}
          groupSortBy={groupSortBy}
          onSortChange={setGroupSortBy}
          onSelectDate={setSelectedDate}
          onSelectGroup={(groupId) => {
            setSelectedGroup(groupId);
            closeSidebar();
          }}
          onSummarizeDay={handleSummarizeDay}
          onRangeChange={setDateRange}
          aiProvider={aiProvider}
          onAiProviderChange={setAiProvider}
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
    </div>
  );
}
