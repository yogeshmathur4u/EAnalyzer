import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Inbox, ShieldCheck, CalendarRange, RefreshCw, CheckCircle2, Eye, ShieldHalf, Sparkles } from 'lucide-react'
import { Header } from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { ExtractedMessagesDialog } from '@/components/ExtractedMessagesDialog'
import { ThreadStoryDialog } from '@/components/ThreadStoryDialog'
import { AskAIPanel } from '@/components/AskAIPanel'
import { ChipInput } from '@/components/ChipInput'
import { ConsentDialog } from '@/components/ConsentDialog'
import { SyncPreviewDialog } from '@/components/SyncPreviewDialog'
import { ToastContainer } from '@/components/ui/toast'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { api } from '@/lib/api'
import { TIME_RANGES, buildDateRangeQuery, buildDateRangeBounds } from '@/lib/dateRanges'
import { getLabelColorClasses, formatLabel } from '@/lib/labelColors'
import { formatDateTime } from '@/lib/formatDate'

const HIDDEN_LABELS = new Set(['UNREAD', 'IMPORTANT', 'CATEGORY_PERSONAL'])
const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
]

function avatarColorFor(name) {
  if (!name) return AVATAR_COLORS[0]
  const sum = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}

function initialsFor(name) {
  if (!name) return '?'
  const match = name.match(/^[^<]+/)
  const clean = (match ? match[0] : name).trim()
  return clean.slice(0, 2).toUpperCase()
}

function getLastSyncedAt(threads) {
  if (threads.length === 0) return null
  return threads.reduce((latest, thread) => {
    if (!thread.lastSyncedAt) return latest
    const current = new Date(thread.lastSyncedAt)
    return !latest || current > latest ? current : latest
  }, null)
}

export function DashboardPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { toasts, showToast, dismissToast } = useToast()
  const [emailFilter, setEmailFilter] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [timeRange, setTimeRange] = useState('7d')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [personFilters, setPersonFilters] = useState([])
  const [keywordFilters, setKeywordFilters] = useState([])
  const [resultLimit, setResultLimit] = useState(50)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewThreads, setPreviewThreads] = useState([])
  const [selectedPreviewIds, setSelectedPreviewIds] = useState(new Set())
  const [confirmingSync, setConfirmingSync] = useState(false)
  const [threads, setThreads] = useState([])
  const [total, setTotal] = useState(0)
  const [totalMessages, setTotalMessages] = useState(0)
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [refreshingAuthorized, setRefreshingAuthorized] = useState(false)
  const [viewExtractedThreadId, setViewExtractedThreadId] = useState(null)
  const [storyThreadId, setStoryThreadId] = useState(null)
  const [consentDialogOpen, setConsentDialogOpen] = useState(false)
  const [submittingConsent, setSubmittingConsent] = useState(false)
  const debounceRef = useRef(null)
  const lastSyncedAt = getLastSyncedAt(threads)

  const fetchSavedThreads = useCallback(
    async (email, subject, pageNum) => {
      const isFirstPage = pageNum === 1
      isFirstPage ? setLoading(true) : setLoadingMore(true)
      setSelectedIds(new Set())

      try {
        const data = await api.getSavedThreads({
          emailFilter: email,
          subjectFilter: subject,
          page: pageNum,
        })
        setThreads((prev) => (isFirstPage ? data.threads : [...prev, ...data.threads]))
        setTotal(data.total)
        setTotalMessages(data.totalMessages)
        setPage(pageNum)
      } catch (err) {
        console.error('Failed to fetch saved threads:', err)
        if (isFirstPage) setThreads([])
        showToast(t('dashboard.toastLoadFailed'), 'error')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  useEffect(() => {
    fetchSavedThreads(emailFilter, subjectFilter, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleEmailFilterChange(value) {
    setEmailFilter(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSavedThreads(value, subjectFilter, 1), 400)
  }

  function handleSubjectFilterChange(value) {
    setSubjectFilter(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSavedThreads(emailFilter, value, 1), 400)
  }

  function handleLoadMore() {
    fetchSavedThreads(emailFilter, subjectFilter, page + 1)
  }

  function buildSyncQuery() {
    const personQuery =
      personFilters.length > 0
        ? `(${personFilters.map((p) => `from:"${p}"`).join(' OR ')})`
        : ''
    const keywordQuery =
      keywordFilters.length > 0
        ? `(${keywordFilters.map((k) => `"${k}"`).join(' OR ')})`
        : ''
    return [buildDateRangeQuery(timeRange, { customStart, customEnd }), personQuery, keywordQuery]
      .filter(Boolean)
      .join(' ')
      .trim()
  }

  async function handleSync() {
    setSyncing(true)
    setPreviewOpen(true)
    setPreviewLoading(true)
    try {
      const data = await api.getGmailMetadata({ q: buildSyncQuery(), maxResults: resultLimit })
      setPreviewThreads(data.threads)
      setSelectedPreviewIds(new Set(data.threads.map((t) => t.threadId)))
    } catch (err) {
      console.error('Failed to preview Gmail sync:', err)
      showToast(err.body?.error || t('dashboard.toastSyncFailed'), 'error')
      setPreviewOpen(false)
    } finally {
      setSyncing(false)
      setPreviewLoading(false)
    }
  }

  function togglePreviewSelected(threadId) {
    setSelectedPreviewIds((prev) => {
      const next = new Set(prev)
      if (next.has(threadId)) next.delete(threadId)
      else next.add(threadId)
      return next
    })
  }

  function togglePreviewSelectAll() {
    setSelectedPreviewIds((prev) =>
      prev.size === previewThreads.length
        ? new Set()
        : new Set(previewThreads.map((t) => t.threadId))
    )
  }

  function handlePreviewCancel() {
    setPreviewOpen(false)
    setPreviewThreads([])
    setSelectedPreviewIds(new Set())
  }

  async function handleConfirmSync() {
    setConfirmingSync(true)
    try {
      const result = await api.syncSelectedThreads([...selectedPreviewIds])
      handlePreviewCancel()
      await fetchSavedThreads(emailFilter, subjectFilter, 1)
      showToast(t('dashboard.toastSyncSuccess', { count: result.syncedCount }), 'success')
    } catch (err) {
      console.error('Failed to sync selected threads:', err)
      showToast(err.body?.error || t('dashboard.toastSyncFailed'), 'error')
    } finally {
      setConfirmingSync(false)
    }
  }

  async function handleRefreshAuthorized() {
    setRefreshingAuthorized(true)
    try {
      const result = await api.refreshAuthorizedThreads()
      await fetchSavedThreads(emailFilter, subjectFilter, 1)
      const message =
        result.updatedCount > 0
          ? t('dashboard.toastRefreshSuccessWithUpdates', {
              checked: result.checkedCount,
              reExtracted: result.reExtractedCount,
            })
          : t('dashboard.toastRefreshSuccessNoUpdates', { checked: result.checkedCount })
      showToast(message, 'success')
    } catch (err) {
      console.error('Failed to refresh authorized threads:', err)
      showToast(err.body?.error || t('dashboard.toastRefreshFailed'), 'error')
    } finally {
      setRefreshingAuthorized(false)
    }
  }

  function toggleSelected(threadId) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(threadId)) next.delete(threadId)
      else next.add(threadId)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === threads.length ? new Set() : new Set(threads.map((t) => t.threadId))
    )
  }

  function handleAuthorize() {
    const selectedThreads = threads.filter((t) => selectedIds.has(t.threadId))
    const needsConsent = selectedThreads.some((t) => !t.consentAccepted)

    if (!needsConsent) {
      showToast(t('dashboard.toastAlreadyAuthorized'), 'success')
      setSelectedIds(new Set())
      return
    }

    setConsentDialogOpen(true)
  }

  async function handleConsentConfirm() {
    setSubmittingConsent(true)
    try {
      const result = await api.submitConsent([...selectedIds])
      setConsentDialogOpen(false)
      await fetchSavedThreads(emailFilter, subjectFilter, 1)
      showToast(
        t('dashboard.toastAuthorizeSuccess', {
          updated: result.updatedCount,
          extracted: result.extractedMessageCount,
        }),
        'success'
      )
      if (result.failedThreadCount > 0) {
        showToast(
          t('dashboard.toastAuthorizePartialFailure', { count: result.failedThreadCount }),
          'error'
        )
      }
    } catch (err) {
      console.error('Failed to submit consent:', err)
      showToast(err.body?.error || t('dashboard.toastConsentFailed'), 'error')
    } finally {
      setSubmittingConsent(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-background to-background">
      <Header user={user} />

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="min-w-0 overflow-hidden border-none shadow-md">
          <CardHeader className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-white">{t('dashboard.safetyGate')}</CardTitle>
                <CardDescription className="text-indigo-100">
                  {t('dashboard.safetyGateDescription')}
                </CardDescription>
              </div>
              <div className="ml-auto flex gap-2 text-right">
                <div className="rounded-lg bg-white/10 px-4 py-2">
                  <div className="text-2xl font-semibold text-white">{total}</div>
                  <div className="text-xs text-indigo-100">{t('dashboard.threads')}</div>
                </div>
                <div className="rounded-lg bg-white/10 px-4 py-2">
                  <div className="text-2xl font-semibold text-white">{totalMessages}</div>
                  <div className="text-xs text-indigo-100">{t('dashboard.messages')}</div>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pt-6">
            {/* Sync: fetches new data from Gmail. Does not affect what's currently displayed below. */}
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('dashboard.syncSectionLabel')}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">{t('dashboard.personFilterLabel')}</label>
                  <ChipInput
                    value={personFilters}
                    onChange={setPersonFilters}
                    placeholder={t('dashboard.personFilterPlaceholder')}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">{t('dashboard.dateRangeLabel')}</label>
                  <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger className="w-[180px]">
                      <CalendarRange className="mr-1 h-4 w-4 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_RANGES.map((range) => (
                        <SelectItem key={range.value} value={range.value}>
                          {t(`dateRanges.${range.value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {timeRange === 'custom' && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">{t('dashboard.customRangeLabel')}</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="w-[150px]"
                      />
                      <span className="text-muted-foreground">to</span>
                      <Input
                        type="date"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="w-[150px]"
                      />
                    </div>
                  </div>
                )}

                <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">{t('dashboard.keywordFilterLabel')}</label>
                  <ChipInput
                    value={keywordFilters}
                    onChange={setKeywordFilters}
                    placeholder={t('dashboard.keywordFilterPlaceholder')}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">{t('dashboard.resultLimitLabel')}</label>
                  <Input
                    type="number"
                    min={1}
                    value={resultLimit}
                    onChange={(e) => setResultLimit(Number(e.target.value) || 1)}
                    className="w-[80px]"
                  />
                </div>

                <Button
                  variant="outline"
                  onClick={handleSync}
                  disabled={syncing}
                  title={t('dashboard.syncFromGmailTitle')}
                >
                  {syncing ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
                  {syncing ? t('dashboard.syncing') : t('dashboard.syncFromGmail')}
                </Button>

                <Button
                  variant="outline"
                  onClick={handleRefreshAuthorized}
                  disabled={refreshingAuthorized}
                  title={t('dashboard.refreshAuthorizedTitle')}
                >
                  {refreshingAuthorized ? <Spinner /> : <ShieldHalf className="h-4 w-4" />}
                  {refreshingAuthorized ? t('dashboard.checking') : t('dashboard.refreshAuthorized')}
                </Button>

                {lastSyncedAt && (
                  <span className="self-center text-xs text-muted-foreground">
                    {t('dashboard.lastSynced', { date: formatDateTime(lastSyncedAt) })}
                  </span>
                )}
              </div>
            </div>

            {/* Search: filters the thread list already displayed below */}
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('dashboard.searchSectionLabel')}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">{t('dashboard.emailFilterLabel')}</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={emailFilter}
                      onChange={(e) => handleEmailFilterChange(e.target.value)}
                      placeholder={t('dashboard.emailFilterPlaceholder')}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">{t('dashboard.subjectFilterLabel')}</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={subjectFilter}
                      onChange={(e) => handleSubjectFilterChange(e.target.value)}
                      placeholder={t('dashboard.subjectFilterPlaceholder')}
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleAuthorize}
                disabled={selectedIds.size === 0}
                className="bg-violet-600 hover:bg-violet-700"
              >
                {t('dashboard.authorizeSelected', { count: selectedIds.size })}
              </Button>
            </div>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : threads.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
                <Inbox className="h-8 w-8" />
                <p>{t('dashboard.noThreads')}</p>
                <p className="text-xs">{t('dashboard.noThreadsHint')}</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-indigo-50/60">
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedIds.size === threads.length}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>{t('dashboard.columnFrom')}</TableHead>
                      <TableHead>{t('dashboard.columnSubject')}</TableHead>
                      <TableHead>{t('dashboard.messages')}</TableHead>
                      <TableHead>{t('dashboard.columnLabels')}</TableHead>
                      <TableHead>{t('dashboard.columnStatus')}</TableHead>
                      <TableHead>{t('dashboard.columnDate')}</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {threads.map((thread) => (
                      <TableRow key={thread.threadId}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(thread.threadId)}
                            onCheckedChange={() => toggleSelected(thread.threadId)}
                          />
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <div className="flex items-center gap-2">
                            <div
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${avatarColorFor(thread.from)}`}
                            >
                              {initialsFor(thread.from)}
                            </div>
                            <span className="truncate">{thread.from}</span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[320px] truncate">
                          {thread.subject}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{thread.messageCount}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(thread.labelIds || [])
                              .filter((label) => !HIDDEN_LABELS.has(label))
                              .slice(0, 3)
                              .map((label) => (
                                <Badge
                                  key={label}
                                  className={`border text-[10px] font-medium ${getLabelColorClasses(label)}`}
                                >
                                  {formatLabel(label)}
                                </Badge>
                              ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {thread.consentAccepted ? (
                            <Badge className="border border-emerald-200 bg-emerald-100 text-[10px] font-medium text-emerald-700">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              {t('dashboard.authorized')}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {t('dashboard.notAuthorized')}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(thread.date)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!thread.consentAccepted}
                              title={
                                thread.consentAccepted
                                  ? t('dashboard.viewTitleAuthorized')
                                  : t('dashboard.viewTitleNotAuthorized')
                              }
                              onClick={() => setViewExtractedThreadId(thread.threadId)}
                            >
                              <Eye className="h-4 w-4" />
                              {t('dashboard.view')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!thread.consentAccepted}
                              title={
                                thread.consentAccepted
                                  ? t('dashboard.storyTitle')
                                  : t('dashboard.viewTitleNotAuthorized')
                              }
                              onClick={() => setStoryThreadId(thread.threadId)}
                            >
                              <Sparkles className="h-4 w-4" />
                              {t('dashboard.story')}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {threads.length < total && (
                  <div className="flex justify-center pt-2">
                    <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore}>
                      {loadingMore && <Spinner />}
                      {loadingMore ? t('dashboard.loadingMore') : t('dashboard.loadMore')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="lg:sticky lg:top-8 lg:self-start">
          <AskAIPanel onViewSource={(threadId) => threadId && setViewExtractedThreadId(threadId)} />
        </div>
        </div>
      </main>

      <ExtractedMessagesDialog
        threadId={viewExtractedThreadId}
        onClose={() => setViewExtractedThreadId(null)}
      />

      <ThreadStoryDialog threadId={storyThreadId} onClose={() => setStoryThreadId(null)} />

      <SyncPreviewDialog
        open={previewOpen}
        loading={previewLoading}
        threads={previewThreads}
        selectedIds={selectedPreviewIds}
        onToggleSelected={togglePreviewSelected}
        onToggleSelectAll={togglePreviewSelectAll}
        confirming={confirmingSync}
        onConfirm={handleConfirmSync}
        onCancel={handlePreviewCancel}
      />

      <ConsentDialog
        open={consentDialogOpen}
        count={selectedIds.size}
        submitting={submittingConsent}
        onConfirm={handleConsentConfirm}
        onCancel={() => setConsentDialogOpen(false)}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
