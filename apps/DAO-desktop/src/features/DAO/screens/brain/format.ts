export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const delta = Date.now() - then
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
}
