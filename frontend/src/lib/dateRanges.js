export const TIME_RANGES = [
  { value: 'today' },
  { value: 'yesterday' },
  { value: '7d' },
  { value: '28d' },
  { value: '90d' },
  { value: 'custom' },
]

function formatGmailDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}/${m}/${d}`
}

function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function startOfDay(date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

// Builds a Gmail search query fragment (after:/before:) for the given range.
export function buildDateRangeQuery(range, { customStart, customEnd } = {}) {
  const today = startOfDay(new Date())

  switch (range) {
    case 'today':
      return `after:${formatGmailDate(today)} before:${formatGmailDate(addDays(today, 1))}`
    case 'yesterday':
      return `after:${formatGmailDate(addDays(today, -1))} before:${formatGmailDate(today)}`
    case '7d':
      return 'newer_than:7d'
    case '28d':
      return 'newer_than:28d'
    case '90d':
      return 'newer_than:90d'
    case 'custom': {
      if (!customStart || !customEnd) return ''
      const start = startOfDay(new Date(customStart))
      const end = addDays(startOfDay(new Date(customEnd)), 1)
      return `after:${formatGmailDate(start)} before:${formatGmailDate(end)}`
    }
    default:
      return ''
  }
}

// Builds { startDate, endDate } ISO bounds for filtering against the stored internalDate column.
export function buildDateRangeBounds(range, { customStart, customEnd } = {}) {
  const today = startOfDay(new Date())

  switch (range) {
    case 'today':
      return { startDate: today.toISOString(), endDate: addDays(today, 1).toISOString() }
    case 'yesterday':
      return {
        startDate: addDays(today, -1).toISOString(),
        endDate: today.toISOString(),
      }
    case '7d':
      return { startDate: addDays(today, -7).toISOString(), endDate: undefined }
    case '28d':
      return { startDate: addDays(today, -28).toISOString(), endDate: undefined }
    case '90d':
      return { startDate: addDays(today, -90).toISOString(), endDate: undefined }
    case 'custom': {
      if (!customStart || !customEnd) return { startDate: undefined, endDate: undefined }
      return {
        startDate: startOfDay(new Date(customStart)).toISOString(),
        endDate: addDays(startOfDay(new Date(customEnd)), 1).toISOString(),
      }
    }
    default:
      return { startDate: undefined, endDate: undefined }
  }
}
