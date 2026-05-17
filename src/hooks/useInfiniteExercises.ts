import { useState, useEffect, useRef } from 'react'
import { listExercises, type ExerciseBasic, type MuscleGroup } from '../lib/api'

const PAGE_SIZE = 20

export function useInfiniteExercises(
  search: string,
  muscleFilter?: MuscleGroup | null,
  isCombined?: boolean,
  scrollRoot?: React.RefObject<HTMLElement | null>,
  equipment?: string,
  sortBy?: 'name' | 'mostUsed',
) {
  const [exercises, setExercises] = useState<ExerciseBasic[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [isFetchingMore, setIsFetchingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const hasMore = exercises.length < total

  // Reset + load page 1 whenever search or filter changes
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    setExercises([])
    setTotal(0)
    setPage(1)

    listExercises(search || undefined, 1, PAGE_SIZE, muscleFilter ?? undefined, isCombined, equipment, sortBy)
      .then((res) => {
        if (cancelled) return
        setExercises(res.data)
        setTotal(res.total)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load')
      })
      .finally(() => { if (!cancelled) setIsLoading(false) })

    return () => { cancelled = true }
  }, [search, muscleFilter, isCombined, equipment, sortBy])

  // Keep loadMore in a ref so the observer never stales
  const loadMoreRef = useRef<() => void>(() => {})
  loadMoreRef.current = () => {
    if (isFetchingMore || !hasMore) return
    setIsFetchingMore(true)
    const nextPage = page + 1
    listExercises(search || undefined, nextPage, PAGE_SIZE, muscleFilter ?? undefined, isCombined, equipment, sortBy)
      .then((res) => {
        setExercises((prev) => [...prev, ...res.data])
        setTotal(res.total)
        setPage(nextPage)
      })
      .catch(() => {/* ignore */})
      .finally(() => setIsFetchingMore(false))
  }

  // Set up IntersectionObserver on the sentinel element
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreRef.current() },
      { root: scrollRoot?.current ?? null, rootMargin: '200px', threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }) // runs every render — sentinel may not exist until isLoading becomes false

  const retry = () => {
    setIsLoading(true)
    setError(null)
    listExercises(search || undefined, 1, PAGE_SIZE, muscleFilter ?? undefined, isCombined, equipment, sortBy)
      .then((res) => { setExercises(res.data); setTotal(res.total); setPage(1) })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setIsLoading(false))
  }

  return { exercises, isLoading, isFetchingMore, hasMore, error, sentinelRef, retry }
}
