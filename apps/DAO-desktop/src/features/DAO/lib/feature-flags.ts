/** Lens navigation — six-lens nav is the default product shell. */
export function featureGraphNavEnabled(): boolean {
  const raw = import.meta.env.VITE_FEATURE_GRAPH_NAV?.trim().toLowerCase()
  if (raw === '0' || raw === 'false' || raw === 'no') return false
  return true
}
