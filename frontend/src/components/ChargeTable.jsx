import { useState } from 'react'
import { Pencil, Trash2, Repeat, Check, X, ArrowUpDown } from 'lucide-react'
import CategoryBadge from './CategoryBadge'

const currency = (n) =>
  n < 0
    ? `-$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function ChargeTable({
  charges,
  categories = [],
  onUpdate,
  onDelete,
  sort,
  direction,
  onSortChange,
  editable = true,
}) {
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState({})

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]))

  function startEdit(charge) {
    setEditingId(charge.id)
    setDraft({
      date: charge.date,
      amount: charge.amount,
      source: charge.source,
      nickname: charge.nickname || '',
      category_id: charge.category_id || '',
      recurring: charge.recurring,
    })
  }

  async function saveEdit(id) {
    await onUpdate(id, {
      ...draft,
      amount: parseFloat(draft.amount),
      category_id: draft.category_id || null,
    })
    setEditingId(null)
  }

  function SortHeader({ field, children, className = '' }) {
    const active = sort === field
    return (
      <th
        className={`text-left font-medium text-ink-500 text-xs uppercase tracking-wide py-2.5 px-3 cursor-pointer select-none hover:text-ink-900 ${className}`}
        onClick={() => onSortChange?.(field)}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          <ArrowUpDown size={11} className={active ? 'text-accent' : 'text-ink-300'} />
        </span>
      </th>
    )
  }

  if (!charges.length) {
    return <p className="text-sm text-ink-500 py-8 text-center">No charges match these filters.</p>
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full border-collapse min-w-[720px]">
        <thead>
          <tr className="border-b border-line">
            <SortHeader field="date">Date</SortHeader>
            <SortHeader field="source">Source</SortHeader>
            <th className="text-left font-medium text-ink-500 text-xs uppercase tracking-wide py-2.5 px-3">Nickname</th>
            <SortHeader field="category_id">Category</SortHeader>
            <th className="text-center font-medium text-ink-500 text-xs uppercase tracking-wide py-2.5 px-3">Recurring</th>
            <SortHeader field="amount" className="text-right">
              Amount
            </SortHeader>
            {editable && <th className="py-2.5 px-3 w-20" />}
          </tr>
        </thead>
        <tbody>
          {charges.map((charge) => {
            const isEditing = editingId === charge.id
            const cat = categoryMap[charge.category_id]

            if (isEditing) {
              return (
                <tr key={charge.id} className="border-b border-line bg-accent-light/40">
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={draft.date}
                      onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                      className="w-full text-sm rounded-md border border-line px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={draft.source}
                      onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                      className="w-full text-sm rounded-md border border-line px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={draft.nickname}
                      placeholder="—"
                      onChange={(e) => setDraft({ ...draft, nickname: e.target.value })}
                      className="w-full text-sm rounded-md border border-line px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={draft.category_id}
                      onChange={(e) => setDraft({ ...draft, category_id: e.target.value })}
                      className="w-full text-sm rounded-md border border-line px-2 py-1"
                    >
                      <option value="">Uncategorized</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!draft.recurring}
                      onChange={(e) => setDraft({ ...draft, recurring: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={draft.amount}
                      onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                      className="w-full text-sm rounded-md border border-line px-2 py-1 text-right tabular"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => saveEdit(charge.id)} className="p-1.5 rounded-md text-good hover:bg-good/10">
                        <Check size={15} />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1.5 rounded-md text-ink-500 hover:bg-black/5">
                        <X size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            }

            return (
              <tr key={charge.id} className="border-b border-line group hover:bg-black/[0.015] transition-colors">
                <td className="px-3 py-2.5 text-sm text-ink-700 tabular whitespace-nowrap">{charge.date}</td>
                <td className="px-3 py-2.5 text-sm text-ink-900">{charge.source}</td>
                <td className="px-3 py-2.5 text-sm text-ink-500">{charge.nickname || '—'}</td>
                <td className="px-3 py-2.5">
                  <CategoryBadge name={cat?.name} color={cat?.color} />
                </td>
                <td className="px-3 py-2.5 text-center">
                  {charge.recurring ? <Repeat size={14} className="text-accent mx-auto" /> : null}
                </td>
                <td
                  className={`px-3 py-2.5 text-sm text-right tabular font-medium whitespace-nowrap ${
                    charge.amount < 0 ? 'text-ink-900' : 'text-good'
                  }`}
                >
                  {currency(charge.amount)}
                </td>
                {editable && (
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(charge)} className="p-1.5 rounded-md text-ink-500 hover:bg-black/5">
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => onDelete(charge.id)}
                        className="p-1.5 rounded-md text-over hover:bg-over/10"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
