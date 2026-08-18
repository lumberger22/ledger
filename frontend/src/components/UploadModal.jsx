import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Plus, UploadCloud, Trash2, FileText, Loader2, AlertCircle } from 'lucide-react'
import { uploadCsv } from '../api/upload'

const ACCOUNT_TYPES = [
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'checking', label: 'Checking Account' },
]

let rowIdCounter = 0
const freshRow = () => ({ id: rowIdCounter++, file: null, accountType: 'credit_card' })

export default function UploadModal({ isOpen, onClose }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState([freshRow()])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  if (!isOpen) return null

  function addRow() {
    setRows((prev) => [...prev, freshRow()])
  }

  function removeRow(id) {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  function updateRow(id, patch) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function handleFileChange(id, fileList) {
    const file = fileList?.[0] || null
    updateRow(id, { file })
  }

  function resetAndClose() {
    setRows([freshRow()])
    setError(null)
    setUploading(false)
    onClose()
  }

  async function handleSubmit() {
    const validRows = rows.filter((r) => r.file)
    if (!validRows.length) {
      setError('Choose at least one CSV file to upload.')
      return
    }
    setUploading(true)
    setError(null)
    try {
      // Each file is parsed with its own account-type column mapping, but
      // all end up in one combined batch so they show together in review.
      const results = []
      for (const row of validRows) {
        const result = await uploadCsv(row.file, row.accountType)
        results.push(result)
      }
      const batchIds = results.map((r) => r.batch_id)
      resetAndClose()
      navigate(`/upload-preview?batch_id=${batchIds.join(',')}`)
    } catch (err) {
      setError(err.message)
      setUploading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={resetAndClose}
    >
      <div
        className="bg-surface rounded-xl2 shadow-cardHover w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display font-bold text-lg text-ink-900">Upload Charges</h2>
          <button onClick={resetAndClose} className="p-1.5 rounded-md text-ink-500 hover:bg-black/5">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-ink-500 mb-4">
          Add one or more CSV exports and tell us which account each one is from — a credit card
          statement and a checking account export can be uploaded together and reviewed in one pass.
        </p>

        <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-2 border border-line rounded-lg p-2.5">
              <label className="flex-1 min-w-0 flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
                <FileText size={15} className="text-ink-300 shrink-0" />
                <span className="truncate">{row.file ? row.file.name : 'Choose CSV file…'}</span>
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => handleFileChange(row.id, e.target.files)}
                />
              </label>
              <select
                value={row.accountType}
                onChange={(e) => updateRow(row.id, { accountType: e.target.value })}
                className="text-sm rounded-md border border-line px-2 py-1.5 shrink-0"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              {rows.length > 1 && (
                <button
                  onClick={() => removeRow(row.id)}
                  className="p-1.5 rounded-md text-over hover:bg-over/10 shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        <button onClick={addRow} className="flex items-center gap-1.5 text-sm font-semibold text-accent mt-3">
          <Plus size={14} /> Add another file
        </button>

        {error && (
          <div className="flex items-start gap-2 text-sm text-over mt-3 bg-over/10 border border-over/30 rounded-lg px-3 py-2">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-line">
          <button
            onClick={resetAndClose}
            className="text-sm font-medium text-ink-500 px-3.5 py-2 rounded-lg hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={uploading}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent-dark disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}
