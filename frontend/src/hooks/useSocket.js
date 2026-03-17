import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

let socket = null

/**
 * Custom hook for Socket.IO connection
 * Uses ref pattern — listener is stable, only re-registered when groupId changes
 */
export function useSocket(groupId, onNewMessage) {
  // Keep latest callback in ref — no need to re-register listener when callback changes
  const onNewMessageRef = useRef(onNewMessage)
  useEffect(() => {
    onNewMessageRef.current = onNewMessage
  })

  useEffect(() => {
    const socketUrl = import.meta.env.VITE_API_URL || window.location.origin

    if (!socket) {
      socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      })
    }

    const handleNewMessage = (message) => {
      onNewMessageRef.current(message)
    }

    socket.on('new-message', handleNewMessage)

    if (groupId) {
      socket.emit('join-room', { groupId })
    }

    return () => {
      socket.off('new-message', handleNewMessage)
    }
  }, [groupId]) // ← เฉพาะ groupId เท่านั้น

  return socket
}
