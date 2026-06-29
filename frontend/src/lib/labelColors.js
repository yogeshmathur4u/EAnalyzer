const LABEL_COLORS = {
  INBOX: 'bg-blue-100 text-blue-700 border-blue-200',
  SENT: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  SPAM: 'bg-red-100 text-red-700 border-red-200',
  TRASH: 'bg-gray-100 text-gray-700 border-gray-200',
  STARRED: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  IMPORTANT: 'bg-orange-100 text-orange-700 border-orange-200',
  CATEGORY_PERSONAL: 'bg-teal-100 text-teal-700 border-teal-200',
  CATEGORY_SOCIAL: 'bg-pink-100 text-pink-700 border-pink-200',
  CATEGORY_PROMOTIONS: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  CATEGORY_UPDATES: 'bg-violet-100 text-violet-700 border-violet-200',
  CATEGORY_FORUMS: 'bg-cyan-100 text-cyan-700 border-cyan-200',
}

const DEFAULT_COLOR = 'bg-indigo-100 text-indigo-700 border-indigo-200'

export function getLabelColorClasses(label) {
  return LABEL_COLORS[label] || DEFAULT_COLOR
}

export function formatLabel(label) {
  return label.replace('CATEGORY_', '').replace(/_/g, ' ')
}
