import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '@/features/auth'

import { useDAONavigate } from '../hooks/useDAONavigate'
import { registerDAOSlashNavigation } from '../lib/DAO-slash-nav'

/** Global SSE listener for Jarvis-driven navigation (chat + company shells). */
export function DAONavigateListener() {
  const navigate = useNavigate()
  const { spaceId, spaceSlug } = useAuth()
  useDAONavigate(spaceId, spaceSlug)

  useEffect(() => {
    return registerDAOSlashNavigation(navigate, () => spaceSlug)
  }, [navigate, spaceSlug])

  return null
}
