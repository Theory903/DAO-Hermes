import { useSpaceContext } from '../context/SpaceContext'

export const DEFAULT_LEAD_NAME = 'AI Lead'
export const POWERED_BY_HERMES = 'DAO Agent · Powered by Hermes'

export function useLeadName(): string {
  const space = useSpaceContext()
  return space.ai_lead_config?.name ?? DEFAULT_LEAD_NAME
}
