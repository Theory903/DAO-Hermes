import { useState } from 'react'

import { Button } from '@/components/ui/button'

import { createSpaceObject } from '../../api/space-api'
import { useSpaceContext } from '../../context/SpaceContext'
import { CompanyBanner } from '../../screens/_company-shell'

type CreateObjectFormProps = {
  onCreated?: () => void
}

export function CreateObjectForm({ onCreated }: CreateObjectFormProps) {
  const space = useSpaceContext()
  const [objectType, setObjectType] = useState<'project' | 'decision'>('project')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await createSpaceObject(space.id, { object_type: objectType, title: trimmed })
      setTitle('')
      setMessage(`${objectType === 'project' ? 'Project' : 'Decision'} created.`)
      onCreated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create object')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="DAO-object-create" onSubmit={(e) => void submit(e)}>
      <h3 className="DAO-util-section-label">New work object</h3>
      <div className="DAO-object-create-row">
        <select
          className="DAO-object-create-select"
          onChange={(e) => setObjectType(e.target.value as 'project' | 'decision')}
          value={objectType}
        >
          <option value="project">Project</option>
          <option value="decision">Decision</option>
        </select>
        <input
          className="DAO-object-create-input"
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title…"
          value={title}
        />
        <Button disabled={busy || !title.trim()} size="sm" type="submit">
          {busy ? 'Creating…' : 'Create'}
        </Button>
      </div>
      {message ? <CompanyBanner tone="ok">{message}</CompanyBanner> : null}
      {error ? <CompanyBanner tone="warn">{error}</CompanyBanner> : null}
    </form>
  )
}
