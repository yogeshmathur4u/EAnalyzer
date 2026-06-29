import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { API_BASE_URL } from '@/lib/api'
import { cn } from '@/lib/utils'

export function LoginPage() {
  const { t } = useTranslation()

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle>{t('login.title')}</CardTitle>
          <CardDescription>{t('login.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href={`${API_BASE_URL}/auth/google`}
            className={cn(buttonVariants({ size: 'lg' }), 'w-full')}
          >
            {t('login.signIn')}
          </a>
        </CardContent>
      </Card>
    </div>
  )
}
