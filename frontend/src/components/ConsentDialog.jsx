import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

export function ConsentDialog({ open, count, submitting, onConfirm, onCancel }) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <DialogTitle>{t('consent.title', { count })}</DialogTitle>
          <DialogDescription>
            {count === 1 ? t('consent.descriptionSingle') : t('consent.descriptionPlural')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            {t('consent.cancel')}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={submitting}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {submitting && <Spinner />}
            {submitting ? t('consent.authorizing') : t('consent.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
