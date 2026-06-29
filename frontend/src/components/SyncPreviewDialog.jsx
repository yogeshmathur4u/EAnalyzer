import { useTranslation } from 'react-i18next'
import { Inbox } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { formatDateTime } from '@/lib/formatDate'

export function SyncPreviewDialog({
  open,
  loading,
  threads,
  selectedIds,
  onToggleSelected,
  onToggleSelectAll,
  confirming,
  onConfirm,
  onCancel,
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('syncPreview.title')}</DialogTitle>
          <DialogDescription>{t('syncPreview.description')}</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!loading && threads.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Inbox className="h-8 w-8" />
            <p>{t('syncPreview.noResults')}</p>
          </div>
        )}

        {!loading && threads.length > 0 && (
          <>
            <div className="flex items-center gap-2 border-b pb-2">
              <Checkbox
                checked={selectedIds.size === threads.length}
                onCheckedChange={onToggleSelectAll}
              />
              <span className="text-xs text-muted-foreground">{t('syncPreview.selectAll')}</span>
            </div>

            <div className="max-h-[50vh] space-y-2 overflow-y-auto">
              {threads.map((thread) => (
                <div
                  key={thread.threadId}
                  className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={selectedIds.has(thread.threadId)}
                    onCheckedChange={() => onToggleSelected(thread.threadId)}
                  />
                  <span className="w-1/3 truncate text-muted-foreground">{thread.from}</span>
                  <span className="flex-1 truncate font-medium">{thread.subject}</span>
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(thread.date)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel} disabled={confirming}>
            {t('syncPreview.cancel')}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={confirming || loading || selectedIds.size === 0}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {confirming && <Spinner />}
            {t('syncPreview.syncSelected', { count: selectedIds.size })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
