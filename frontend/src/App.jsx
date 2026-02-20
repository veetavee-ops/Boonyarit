import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { checkAuth, logout } from './api/auth'
import { useGroups, useMessages } from './hooks/useMessages'
import { useSocket } from './hooks/useSocket'
import { summarizeDay } from './api/messages'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage' // 🔒 Hidden page
import Sidebar from './components/Sidebar/Sidebar'
import ChatWindow from './components/ChatWindow/ChatWindow'
import SummaryModal from './components/SummaryModal/SummaryModal'
import './App.css'

export default function App() {
  const [admin, setAdmin] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // 🔒 Check for hidden registration route (Simple Router)
  if (window.location.pathname === '/register-admin') {
    return <RegisterPage />
  }

  const today = format(new Date(), 'yyyy-MM-dd')
  const [selectedDate, setSelectedDate] = useState(today)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [search, setSearch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [showDaySummary, setShowDaySummary] = useState(false)
  const [daySummary, setDaySummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState(null)

  const { groups, loading: groupsLoading } = useGroups(selectedDate, refreshKey)
  const { messages, loading: msgsLoading, addMessage } = useMessages(selectedGroup, selectedDate)

  /* 
    ✅ Handle incoming real-time messages (Global Listener)
    - If message belongs to current chat -> Add to view
    - Always -> Trigger sidebar refresh (to show new group or reorder list)
  */
  const handleNewMessage = useCallback((newMessage) => {
    const msgGroupId = newMessage.groupId || `private_${newMessage.userId}`

    // 1. If looking at this group, add message to chat window
    if (msgGroupId === selectedGroup) {
      addMessage(newMessage)
    }

    // 2. Always refresh sidebar (to show new group or update "last message")
    setRefreshKey(prev => prev + 1)

    // Optional: Auto-select if first time and nothing selected? (Maybe better not to intrude)
  }, [addMessage, selectedGroup])

  useSocket(selectedGroup, selectedDate, handleNewMessage)

  useEffect(() => {
    checkAuth()
      .then(admin => {
        setAdmin(admin)
      })
      .catch(() => {
        setAdmin(null)
      })
      .finally(() => {
        setAuthLoading(false)
      })
  }, [])

  useEffect(() => {
    const groupsList = Array.isArray(groups) ? groups : []
    if (!selectedGroup && groupsList.length > 0 && !groupsLoading) {
      setSelectedGroup(groupsList[0].groupId)
    }
  }, [groups, groupsLoading, selectedGroup])

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // ✅ Login handler
  const handleLogin = (adminData) => {
    console.log('🎉 App.jsx received login:', adminData)
    setAdmin(adminData)
  }

  const handleLogout = async () => {
    console.log('👋 Logging out...')
    await logout()
    setAdmin(null)
  }

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev)
  }

  const closeSidebar = () => {
    setIsSidebarOpen(false)
  }

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    )
  }

  // ✅ ตรวจสอบว่า admin เป็น null
  console.log('Current admin state:', admin)

  if (!admin) {
    console.log('📝 Showing LoginPage')
    return <LoginPage onLogin={handleLogin} />
  }

  const handleSummarizeDay = async () => {
    setShowDaySummary(true)
    setSummaryLoading(true)
    setSummaryError(null)
    setDaySummary(null)

    try {
      const result = await summarizeDay(selectedDate)
      setDaySummary(result)
    } catch (error) {
      setSummaryError(error.message)
    } finally {
      setSummaryLoading(false)
    }
  }

  const groupsList = Array.isArray(groups) ? groups : []
  const currentGroup = groupsList.find(g => g.groupId === selectedGroup)
  const privateChats = groupsList.filter(g => g.isPrivate)
  const realGroups = groupsList.filter(g => !g.isPrivate)

  if (groupsLoading && groupsList.length === 0) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>กำลังโหลด...</p>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="app-header">
        <div className="header-left-controls">
          <button className="menu-btn" onClick={toggleSidebar}>
            ☰
          </button>
        </div>
        <div className="user-info">
          <span>👤 {admin.username}</span>
          <button onClick={handleLogout} className="btn-logout">
            Logout
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
          privateChats={privateChats}
          realGroups={realGroups}
          onSelectDate={setSelectedDate}
          onSelectGroup={(groupId) => {
            setSelectedGroup(groupId)
            closeSidebar() // Close sidebar on selection on mobile
          }}
          onSummarizeDay={handleSummarizeDay}
        />
        <ChatWindow
          currentGroup={currentGroup}
          selectedDate={selectedDate}
          messages={messages}
          loading={msgsLoading}
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
  )
}