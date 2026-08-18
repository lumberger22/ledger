const OPTIONS = [
  { value: '30d', label: '30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'ytd', label: 'YTD' },
]

export default function PeriodFilter({ value, onChange, options = OPTIONS }) {
  return (
    <div className="inline-flex items-center bg-black/[0.04] rounded-lg p-1 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            value === opt.value
              ? 'bg-white text-ink-900 shadow-sm'
              : 'text-ink-500 hover:text-ink-900'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
