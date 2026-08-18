import { useEffect, useState } from 'react'
import { Download, AlertTriangle, Check, FolderOpen, PiggyBank } from 'lucide-react'
import { getSettings, updateSettings, backupUrl, resetAllData } from '../api/settings'
import { getBudget, updateBudget } from '../api/budget'
import { Link } from 'react-router-dom'

export default function Settings() {
  const [settings, setSettings] = useState(null)
  const [budget, setBudget] = useState(null)
  const [saved, setSaved] = useState(false)
  const [resetConfirming, setResetConfirming] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getSettings(), getBudget()])
      .then(([s, b]) => {
        setSettings(s)
        setBudget(b)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    await updateSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleReset() {
    setResetting(true)
    try {
      await resetAllData()
      window.location.href = '/'
    } finally {
      setResetting(false)
    }
  }

  if (loading || !settings) {
    return <p className="text-sm text-ink-500">Loading…</p>
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="font-display font-bold text-2xl text-ink-900">Settings</h1>

      <section className="bg-surface border border-line rounded-xl2 shadow-card p-6 space-y-4">
        <p className="font-display font-semibold text-ink-900 flex items-center gap-2">
          <FolderOpen size={16} className="text-accent" /> Data & Format
        </p>

        <div>
          <label className="block text-xs font-medium text-ink-500 uppercase tracking-wide mb-1.5">Data Folder</label>
          <input
            value={settings.data_folder}
            onChange={(e) => setSettings({ ...settings, data_folder: e.target.value })}
            className="w-full text-sm rounded-lg border border-line px-3 py-2"
          />
          <p className="text-xs text-ink-500 mt-1">
            Where <code className="bg-black/5 px-1 rounded">charges.db</code>, <code className="bg-black/5 px-1 rounded">budget.json</code>, and{' '}
            <code className="bg-black/5 px-1 rounded">settings.json</code> live. Changing this here is informational only —
            the backend currently reads from its <code className="bg-black/5 px-1 rounded">user_data/</code> folder.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-500 uppercase tracking-wide mb-1.5">Currency</label>
            <input
              value={settings.currency}
              onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
              className="w-full text-sm rounded-lg border border-line px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-500 uppercase tracking-wide mb-1.5">Date Format</label>
            <input
              value={settings.date_format}
              onChange={(e) => setSettings({ ...settings, date_format: e.target.value })}
              className="w-full text-sm rounded-lg border border-line px-3 py-2"
            />
          </div>
        </div>
      </section>

      <section className="bg-surface border border-line rounded-xl2 shadow-card p-6 space-y-4">
        <p className="font-display font-semibold text-ink-900">Credit Card CSV Mapping</p>
        <p className="text-xs text-ink-500 -mt-2">
          Match the header names your credit card's CSV export uses, so uploads parse correctly.
        </p>
        <div className="grid grid-cols-3 gap-4">
          {['date', 'amount', 'description'].map((field) => (
            <div key={field}>
              <label className="block text-xs font-medium text-ink-500 uppercase tracking-wide mb-1.5 capitalize">{field}</label>
              <input
                value={settings.csv_column_mapping[field]}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    csv_column_mapping: { ...settings.csv_column_mapping, [field]: e.target.value },
                  })
                }
                className="w-full text-sm rounded-lg border border-line px-3 py-2"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="bg-surface border border-line rounded-xl2 shadow-card p-6 space-y-4">
        <p className="font-display font-semibold text-ink-900">Checking Account CSV Mapping</p>
        <p className="text-xs text-ink-500 -mt-2">
          Same idea, for checking account exports — pick this account type when uploading and this
          mapping is used instead. Positive amounts (deposits, paychecks) are always ignored on import
          for both account types.
        </p>
        <div className="grid grid-cols-3 gap-4">
          {['date', 'amount', 'description'].map((field) => (
            <div key={field}>
              <label className="block text-xs font-medium text-ink-500 uppercase tracking-wide mb-1.5 capitalize">{field}</label>
              <input
                value={settings.checking_csv_column_mapping[field]}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    checking_csv_column_mapping: { ...settings.checking_csv_column_mapping, [field]: e.target.value },
                  })
                }
                className="w-full text-sm rounded-lg border border-line px-3 py-2"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="bg-surface border border-line rounded-xl2 shadow-card p-6 space-y-3">
        <p className="font-display font-semibold text-ink-900 flex items-center gap-2">
          <PiggyBank size={16} className="text-accent" /> Category Management
        </p>
        <p className="text-xs text-ink-500">
          Categories and monthly targets are managed on the Budget page — this is the same underlying data.
        </p>
        <Link
          to="/budget"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-dark"
        >
          Go to Budget →
        </Link>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 bg-accent hover:bg-accent-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          {saved ? (
            <>
              <Check size={15} /> Saved
            </>
          ) : (
            'Save Settings'
          )}
        </button>
      </div>

      <section className="bg-surface border border-line rounded-xl2 shadow-card p-6 space-y-3">
        <p className="font-display font-semibold text-ink-900">Backup & Export</p>
        <p className="text-sm text-ink-500">
          Download the SQLite database and JSON config files as a single zip.
        </p>
        <a
          href={backupUrl()}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent border border-accent/30 hover:bg-accent-light px-3.5 py-2 rounded-lg"
        >
          <Download size={15} /> Download Backup
        </a>
      </section>

      <section className="bg-over/5 border border-over/30 rounded-xl2 p-6 space-y-3">
        <p className="font-display font-semibold text-over flex items-center gap-2">
          <AlertTriangle size={16} /> Danger Zone
        </p>
        <p className="text-sm text-ink-700">
          Permanently delete all charges and reset your budget and settings to defaults. This can't be undone —
          since there's no login on this app, we ask you to confirm explicitly.
        </p>
        {!resetConfirming ? (
          <button
            onClick={() => setResetConfirming(true)}
            className="text-sm font-semibold text-over border border-over/40 hover:bg-over/10 px-3.5 py-2 rounded-lg"
          >
            Reset All Data…
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              disabled={resetting}
              className="text-sm font-semibold text-white bg-over hover:bg-over/90 disabled:opacity-60 px-3.5 py-2 rounded-lg"
            >
              {resetting ? 'Resetting…' : 'Yes, delete everything'}
            </button>
            <button
              onClick={() => setResetConfirming(false)}
              className="text-sm font-medium text-ink-500 px-3.5 py-2 rounded-lg hover:bg-black/5"
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
