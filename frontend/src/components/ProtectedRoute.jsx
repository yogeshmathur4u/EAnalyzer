import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { Spinner } from '@/components/ui/spinner'

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground">
        <Spinner className="h-5 w-5" />
        {t('common.loading')}
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" replace />
  }

  return children
}
