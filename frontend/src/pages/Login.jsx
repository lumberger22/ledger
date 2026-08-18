import { useState } from 'react'
import { Lock } from 'lucide-react'
import { api, setStoredApiKey } from '../api/client'

export default function Login({ onSuccess }) {
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setChecking(true)

    setStoredApiKey(apiKey.trim())

    try {
      await api.get('/api/health')
      // Health is public; verify the key against a protected route.
      await api.get('/api/settings')
      onSuccess()
    } catch (err) {
      setStoredApiKey('')
      setError(err.status === 401 ? 'Invalid API key.' : err.message || 'Could not connect.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-surface border border-line rounded-xl2 shadow-card p-8 space-y-5">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent-light text-accent">
            <Lock size={22} />
          </div>
          <h1 className="font-display font-bold text-xl text-ink-900">Budget App</h1>
          <p className="text-sm text-ink-500">Enter your API key to continue.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-500 uppercase tracking-wide mb-1.5">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoFocus
              required
              className="w-full text-sm rounded-lg border border-line px-3 py-2"
              placeholder="Paste the key from Railway"
            />
          </div>

          {error && <p className="text-sm text-over">{error}</p>}

          <button
            type="submit"
            disabled={checking || !apiKey.trim()}
            className="w-full bg-accent hover:bg-accent-dark disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            {checking ? 'Checking…' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  )
}
