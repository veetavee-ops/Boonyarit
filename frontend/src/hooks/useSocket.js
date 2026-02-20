import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

let socket = null

/**
 * Custom hook for Socket.IO connection
 * Manages real-time message updates from the backend
 */
export function useSocket(groupId, date, onNewMessage) {
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5

  useEffect(() => {
    // Get Socket.IO URL from environment variable or use default
    const socketUrl = import.meta.env.VITE_API_URL;

    // Create socket connection if not exists
    if (!socket) {
      // console.log('🔌 Connecting to Socket.IO:', socketUrl)

      socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: maxReconnectAttempts
      })

      socket.on('connect', () => {
        reconnectAttempts.current = 0
      })

      socket.on('disconnect', () => {
        // Disconnected
      })

      socket.on('connect_error', (error) => {
        reconnectAttempts.current++
        console.error(`❌ Socket connection error (attempt ${reconnectAttempts.current}):`, error.message)

        if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.error('❌ Max reconnection attempts reached')
        }
      })

      socket.on('reconnect', () => {
        // Reconnected
      })
    }

    // ✅ Always listen for new messages (Global)
    const handleNewMessage = (message) => {
      onNewMessage(message)
    }

    socket.on('new-message', handleNewMessage)

    // Join room if group is selected (Optional for now, but good for future scoping)
    if (groupId && date) {
      // const room = `${groupId}-${date}`
      socket.emit('join-room', { groupId, date })
    }

    // Cleanup
    return () => {
      socket.off('new-message', handleNewMessage)
    }
  }, [groupId, date, onNewMessage])

  return socket
}
