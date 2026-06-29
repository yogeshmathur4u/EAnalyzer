import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { ENABLED_LANGUAGES } from '@/i18n/languages'

export function LanguageSwitcher() {
  const { i18n } = useTranslation()

  return (
    <Select value={i18n.resolvedLanguage} onValueChange={(code) => i18n.changeLanguage(code)}>
      <SelectTrigger className="w-[110px]">
        <Languages className="mr-1 h-4 w-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ENABLED_LANGUAGES.map((lang) => (
          <SelectItem key={lang.code} value={lang.code}>
            {lang.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
