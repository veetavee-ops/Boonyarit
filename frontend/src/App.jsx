import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { checkAuth, logout } from "./api/auth";
import { useGroups, useMessages } from "./hooks/useMessages";
import { useSocket } from "./hooks/useSocket";
import { summarizeDay } from "./api/messages";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage"; // 🔒 Hidden page
import DriveFilesPage from "./pages/DriveFilesPage";
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [dateRange, setDateRange] = useState({
    rangeValue: 7,
    rangeUnit: "day",
  });

  const [showDaySummary, setShowDaySummary] = useState(false);
  const [daySummary, setDaySummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const { groups, loading: groupsLoading } = useGroups(refreshKey);
  const {
    messages,
    loading: msgsLoading,
    hasMore,
    loadingMore,
    loadMore,
    addMessage,
  } = useMessages(selectedGroup);

  const handleNewMessage = useCallback(
    (newMessage) => {
      // Group: use groupId directly. Private: match the "private_name_" format from groups API
      const msgGroupId = newMessage.groupId
        ? newMessage.groupId
        : `private_name_${newMessage.user?.displayName}`;

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
    checkAuth()
      .then((admin) => {
        setAdmin(admin);
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
      );
      setDaySummary(result);
    } catch (error) {
      setSummaryError(error.message);
    } finally {
      setSummaryLoading(false);
    }
  };

  const groupsList = Array.isArray(groups) ? groups : [];
  // Dedup by groupId only — backend already groups by displayName
  const uniqueGroups = groupsList.filter(
    (g, i, arr) => arr.findIndex((x) => x.groupId === g.groupId) === i,
  );
  const currentGroup = uniqueGroups.find((g) => g.groupId === selectedGroup);
  // const privateChats = uniqueGroups.filter((g) => g.isPrivate);
  const realGroups = uniqueGroups
    .filter((g) => !g.isPrivate)
    .sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));

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
            aria-label="เปิดเมนู"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
            </svg>
          </button>
        </div>
        <div className="header-brand">
          <span className="header-brand-icon">
            <svg viewBox="0 0 24 24" fill="white" width="18" height="18">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
            </svg>
          </span>
          <span className="header-brand-name">Sotus LINE OA</span>
        </div>
        <div className="user-info">
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
        </div>
      </div>

      <div className="app-body">
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={closeSidebar}
          refreshKey={refreshKey} // ✅ Pass refreshKey for real-time updates
          selectedDate={selectedDate}
          selectedGroup={selectedGroup}
          realGroups={realGroups}
          onSelectDate={setSelectedDate}
          onSelectGroup={(groupId) => {
            setSelectedGroup(groupId);
            closeSidebar(); // Close sidebar on selection on mobile
          }}
          onSummarizeDay={handleSummarizeDay}
          onRangeChange={setDateRange}
        />
        <ChatWindow
          currentGroup={currentGroup}
          messages={messages}
          loading={msgsLoading}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          search={search}
          onSearchChange={setSearch}
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
