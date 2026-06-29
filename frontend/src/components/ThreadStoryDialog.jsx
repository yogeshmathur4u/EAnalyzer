import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Sparkles, FileText } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/formatDate'

export function ThreadStoryDialog({ threadId, onClose }) {
  const { t } = useTranslation()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!threadId) return

    setLoading(true)
    setError(null)
    setResult(null)

    api
      .generateThreadStory(threadId)
      .then(setResult)
      .catch((err) => {
        console.error('Failed to generate thread story:', err)
        setError(err.body?.error || t('threadStory.errorDefault'))
      })
      .finally(() => setLoading(false))
  }, [threadId, t])

  return (
    <Dialog open={!!threadId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2 text-violet-700">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">{t('threadStory.title')}</span>
          </div>
          <DialogTitle>{t('threadStory.title')}</DialogTitle>
          <DialogDescription>{t('threadStory.description')}</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Skeleton className="h-4 w-4 rounded-full" />
              {t('threadStory.generating')}
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {result.story}
            </div>

            {result.sources.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('threadStory.sourcesConsulted')}
                </div>
                <div className="space-y-2">
                  {result.sources.map((source) => (
                    <div
                      key={source.messageId}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Badge variant="secondary" className="shrink-0">
                          [{source.index}]
                        </Badge>
                        <span className="truncate font-medium">{source.subject || '—'}</span>
                        <span className="truncate text-muted-foreground">{source.from}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                        {formatDateTime(source.date)}
                        <FileText className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
