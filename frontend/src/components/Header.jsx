import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { api } from '@/lib/api'

export function Header({ user }) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  async function handleLogout() {
    await api.logout()
    navigate('/')
  }

  const initials = user?.name
    ?.split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <div className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="h-5 w-5" />
        {t('header.appName')}
      </div>

      <div className="flex items-center gap-3">
        <LanguageSwitcher />

        {user && (
          <>
            <div className="text-right text-sm">
              <div className="font-medium leading-tight">{user.name}</div>
              <div className="text-muted-foreground leading-tight">{user.email}</div>
            </div>
            <Avatar>
              <AvatarImage src={user.picture} alt={user.name} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              {t('header.logout')}
            </Button>
          </>
        )}
      </div>
    </header>
  )
}
