import { useState, useEffect, useCallback } from 'react'
import { listCalls } from '../../lib/api'
import { MOCK_CALLS, mockListShape } from '../mock/calls'

// Lista de llamadas. Intenta el API real; si no hay backend, cae a mock.
// `source` indica de dónde vienen los datos ('live' | 'mock').
export function useCalls() {
  const [calls, setCalls] = useState(null)
  const [source, setSource] = useState('loading')

  const refresh = useCallback(() => {
    let alive = true
    listCalls()
      .then(c => { if (alive) { setCalls(c); setSource('live') } })
      .catch(() => { if (alive) { setCalls(MOCK_CALLS.map(mockListShape)); setSource('mock') } })
    return () => { alive = false }
  }, [])

  useEffect(() => refresh(), [refresh])

  return { calls: calls || [], loading: calls === null, source, refresh }
}
