import { createContext, useContext, type ReactNode } from 'react'

import type { DAOSpace } from '../api/types'

const SpaceContext = createContext<DAOSpace | null>(null)

export function SpaceProvider({ space, children }: { space: DAOSpace; children: ReactNode }) {
  return <SpaceContext.Provider value={space}>{children}</SpaceContext.Provider>
}

export function useSpaceContext(): DAOSpace {
  const space = useContext(SpaceContext)
  if (!space) throw new Error('useSpaceContext must be used within SpaceProvider')
  return space
}

export function useOptionalSpaceContext(): DAOSpace | null {
  return useContext(SpaceContext)
}
