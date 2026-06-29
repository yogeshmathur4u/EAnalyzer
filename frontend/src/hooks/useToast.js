import { useCallback, useRef, useState } from 'react'

let idCounter = 0

export function useToast() {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const showToast = useCallback(
    (message, variant = 'success', duration = 4000) => {
      const id = ++idCounter
      setToasts((prev) => [...prev, { id, message, variant }])
      const timer = setTimeout(() => dismissToast(id), duration)
      timers.current.set(id, timer)
    },
    [dismissToast]
  )

  return { toasts, showToast, dismissToast }
}
