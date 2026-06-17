import { FormEvent, useState } from 'react'
import { Search } from 'lucide-react'

import { Button } from '@/components/ui/button'

type AskDaoBarProps = {
  onSubmit: (query: string) => void
  placeholder?: string
}

export function AskDaoBar({ onSubmit, placeholder = 'Ask DAO anything…' }: AskDaoBarProps) {
  const [query, setQuery] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setQuery('')
  }

  return (
    <form className="DAO-home-ask" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="dao-home-ask">
        Ask DAO
      </label>
      <Search aria-hidden className="DAO-home-ask__icon" size={18} />
      <input
        className="DAO-home-ask__input"
        id="dao-home-ask"
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={query}
      />
      <Button size="sm" type="submit" variant="secondary">
        Ask
      </Button>
    </form>
  )
}
