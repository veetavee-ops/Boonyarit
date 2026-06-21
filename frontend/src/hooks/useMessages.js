import { useState, useEffect, useCallback } from 'react'
import { fetchMessages, fetchGroups } from '../api/messages'

// Groups: no date filter — always returns all groups/private chats
export function useGroups(refreshKey = 0) {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      setLoading(false)
      return
    }

    let cancelled = false

    fetchGroups()
      .then(data => { if (!cancelled) setGroups(data) })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [refreshKey])

  return { groups, loading }
}

// Messages: fetch with pagination
export function useMessages(groupId) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)

  // Pagination state
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const limit = 50

  useEffect(() => {
    if (!groupId) return

    let cancelled = false
    setMessages([])   // clear ข้อความเก่าทันที ก่อน fetch ใหม่
    setLoading(true)
    setHasMore(true) // reset on group change

    fetchMessages({ groupId, limit })
      .then(data => {
        if (!cancelled) {
          setMessages(data)
          setHasMore(data.length === limit)
          setLoading(false)
        }
      })
      .catch(error => {
        console.error(error)
        if (!cancelled) {
          setMessages([])
          setHasMore(false)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [groupId])

  const loadMore = useCallback(async () => {
    if (!groupId || loadingMore || !hasMore || messages.length === 0) return

    setLoadingMore(true)
    try {
      const oldestMessage = messages[0]
      const data = await fetchMessages({
        groupId,
        limit,
        before: oldestMessage.timestamp
      })

      if (data.length > 0) {
        setMessages(prev => [...data, ...prev])
      }
      setHasMore(data.length === limit)
    } catch (error) {
      console.error('Failed to load older messages', error)
      setHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }, [groupId, loadingMore, hasMore, messages])

  const addMessage = useCallback((newMessage) => {
    setMessages(prev => {
      if (prev.find(m => m.id === newMessage.id)) return prev
      return [...prev, newMessage]
    })
  }, [])

  const updateMessage = useCallback((messageId, patch) => {
    setMessages(prev => prev.map(m => m.messageId === messageId ? { ...m, ...patch } : m))
  }, [])

  return { messages, loading, hasMore, loadingMore, loadMore, addMessage, updateMessage }
}