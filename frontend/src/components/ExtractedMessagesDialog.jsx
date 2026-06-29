import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ShieldCheck, Inbox, Printer } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/formatDate'

export function ExtractedMessagesDialog({ threadId, onClose }) {
  const { t } = useTranslation()
  const [thread, setThread] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!threadId) return

    setLoading(true)
    setError(null)
    setThread(null)

    api
      .getExtractedMessages(threadId)
      .then(setThread)
      .catch((err) => {
        console.error('Failed to fetch extracted messages:', err)
        setError(t('extracted.loadFailed'))
      })
      .finally(() => setLoading(false))
  }, [threadId, t])

  const handlePrint = () => {
    const previousTitle = document.title
    document.title = thread?.messages?.[0]?.subject || t('extracted.defaultTitle')

    const restoreTitle = () => {
      document.title = previousTitle
      window.removeEventListener('afterprint', restoreTitle)
    }
    window.addEventListener('afterprint', restoreTitle)

    window.print()
  }

  return (
    <Dialog open={!!threadId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">
                {t('extracted.sanitizedBadge')}
              </span>
            </div>
            {thread && thread.messages.length > 0 && (
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4" />
                {t('extracted.printPdf')}
              </Button>
            )}
          </div>
          <DialogTitle>{thread?.messages?.[0]?.subject || t('extracted.defaultTitle')}</DialogTitle>
          <DialogDescription>{t('extracted.sanitizedNote')}</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {thread && thread.messages.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Inbox className="h-8 w-8" />
            <p>{t('extracted.notAuthorizedYet')}</p>
          </div>
        )}

        {thread && thread.messages.length > 0 && (
          <div className="space-y-4">
            {thread.messages.map((message) => (
              <div key={message.id} className="rounded-md border p-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">{message.from}</span>
                  <span className="text-muted-foreground">{formatDateTime(message.date)}</span>
                </div>
                <div className="whitespace-pre-wrap text-sm text-foreground">
                  {message.sanitizedText || (
                    <span className="text-muted-foreground">{t('extracted.noReadableContent')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>

      {thread &&
        thread.messages.length > 0 &&
        createPortal(
          <div id="printable-thread" className="hidden p-8 print:block">
            <h1 className="mb-1 text-xl font-semibold">
              {thread.messages[0].subject || t('extracted.defaultTitle')}
            </h1>
            <p className="mb-6 text-sm text-muted-foreground">{t('extracted.sanitizedNote')}</p>
            <div className="space-y-4">
              {thread.messages.map((message) => (
                <div key={message.id} className="break-inside-avoid border-b pb-4">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">{message.from}</span>
                    <span className="text-muted-foreground">{formatDateTime(message.date)}</span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-foreground">
                    {message.sanitizedText || t('extracted.noReadableContent')}
                  </div>
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </Dialog>
  )
}
