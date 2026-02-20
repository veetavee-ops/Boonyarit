/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from 'react'
import { fetchMessages, fetchGroups } from '../api/messages'

export function useGroups(date, refreshKey = 0) { // ✅ เพิ่ม refreshKey
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    fetchGroups(date)
      .then(data => {
        if (!cancelled) setGroups(data)
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [date, refreshKey]) // ✅ เพิ่ม refreshKey ใน dependency

  return { groups, loading }
}

export function useMessages(groupId, date) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!groupId || !date) return

    let cancelled = false
    setLoading(true)

    fetchMessages({ groupId, date })
      .then(data => {
        if (!cancelled) {
          setMessages(data)
          setLoading(false)
        }
      })
      .catch(error => {
        console.error(error)
        if (!cancelled) {
          setMessages([])
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [groupId, date])

  const addMessage = useCallback((newMessage) => {
    setMessages(prev => {
      if (prev.find(m => m.id === newMessage.id)) {
        return prev
      }
      return [...prev, newMessage]
    })
  }, [])

  return { messages, loading, addMessage }
}