import { useState, useEffect } from 'react'
import { getCall } from '../../lib/api'
import { MOCK_CALLS } from '../mock/calls'

// Detalle de una llamada. API real con fallback a mock por id.
export function useCall(id) {
  const [call, setCall] = useState(null)
  const [source, setSource] = useState('loading')

  useEffect(() => {
    let alive = true
    getCall(id)
      .then(c => { if (alive) { setCall(c); setSource('live') } })
      .catch(() => { if (alive) { setCall(MOCK_CALLS.find(c => c.id === id) || null); setSource('mock') } })
    return () => { alive = false }
  }, [id])

  return { call, loading: call === null && source === 'loading', source }
}
