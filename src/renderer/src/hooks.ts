/**
 * hooks.ts — small React helpers around window.pai.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { EventMap, EventName, Result } from '@shared/ipc'

/** Subscribe to a push event from main for the lifetime of the component. */
export function usePaiEvent<E extends EventName>(event: E, cb: (payload: EventMap[E]) => void): void {
  const ref = useRef(cb)
  useEffect(() => {
    ref.current = cb
  })
  useEffect(() => window.pai.on(event, (p) => ref.current(p)), [event])
}

type What = EventMap['data:changed']['what']

/**
 * Load data from main, and reload automatically when main says it changed.
 * Returns { data, error, reload }.
 */
export function useData<T>(load: () => Promise<Result<T>>, refreshOn?: What) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loadRef = useRef(load)
  loadRef.current = load

  const reload = useCallback(async () => {
    const res = await loadRef.current()
    if (res.ok) {
      setData(res.value)
      setError(null)
    } else setError(res.error)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  usePaiEvent('data:changed', ({ what }) => {
    if (what === refreshOn) void reload()
  })

  return { data, error, reload, setData }
}

/** "3 minutes ago" style times. */
export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString()
}
