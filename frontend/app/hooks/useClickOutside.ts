import { useEffect, RefObject } from 'react'

export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  callback: () => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return

    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [ref, callback, enabled])
}
