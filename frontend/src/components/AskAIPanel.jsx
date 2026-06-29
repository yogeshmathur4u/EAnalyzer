import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Send, AlertCircle, FileText } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/formatDate'

export function AskAIPanel({ onViewSource }) {
  const { t } = useTranslation()
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function handleAsk(e) {
    e.preventDefault()
    if (!question.trim() || loading) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await api.askQuestion({ question: question.trim() })
      setResult(data)
    } catch (err) {
      console.error('Failed to get AI answer:', err)
      setError(err.body?.error || t('askAI.errorDefault'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="overflow-hidden border-none shadow-md">
      <CardHeader className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-white">{t('askAI.title')}</CardTitle>
            <CardDescription className="text-indigo-100">{t('askAI.description')}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-6">
        <form onSubmit={handleAsk} className="flex items-center gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('askAI.placeholder')}
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !question.trim()}>
            {loading ? <Spinner /> : <Send className="h-4 w-4" />}
            {t('askAI.ask')}
          </Button>
        </form>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-4 text-sm whitespace-pre-wrap">
              {result.answer}
            </div>

            {result.sources.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('askAI.sourcesConsulted')}
                </div>
                <div className="space-y-2">
                  {result.sources.map((source) => (
                    <button
                      key={`${source.messageId}-${source.index}`}
                      onClick={() => onViewSource?.(source.threadId)}
                      className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs hover:bg-accent"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Badge variant="secondary" className="shrink-0">
                          [{source.index}]
                        </Badge>
                        <span className="truncate font-medium">
                          {source.subject || t('askAI.noSubject')}
                        </span>
                        <span className="truncate text-muted-foreground">{source.from}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                        {formatDateTime(source.date)}
                        <FileText className="h-3.5 w-3.5" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
