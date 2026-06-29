import { useState } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

export function ChipInput({ value, onChange, placeholder }) {
  const [draft, setDraft] = useState('')

  function addChip(raw) {
    const trimmed = raw.trim()
    if (!trimmed || value.includes(trimmed)) return
    onChange([...value, trimmed])
    setDraft('')
  }

  function removeChip(chip) {
    onChange(value.filter((c) => c !== chip))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addChip(draft)
    } else if (e.key === 'Backspace' && !draft && value.length > 0) {
      removeChip(value[value.length - 1])
    }
  }

  return (
    <div className="flex min-w-[220px] flex-1 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5">
      {value.map((chip) => (
        <Badge key={chip} variant="secondary" className="gap-1 pr-1">
          {chip}
          <button
            type="button"
            onClick={() => removeChip(chip)}
            className="rounded-full hover:bg-muted-foreground/20"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addChip(draft)}
        placeholder={value.length === 0 ? placeholder : ''}
        className="h-7 flex-1 border-none p-0 shadow-none focus-visible:ring-0"
      />
    </div>
  )
}
