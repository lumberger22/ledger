import { useState } from "react";
import { ScanFace } from "lucide-react";
import { api, setStoredApiKey } from "../api/client";
import { isFaceIdAvailable, isFaceIdEnabled, registerFaceId } from "../api/webauthn";
import Logo from "../components/Logo";

export default function Login({ onSuccess }) {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [offerFaceId, setOfferFaceId] = useState(false);
  const [enabling, setEnabling] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setChecking(true);

    setStoredApiKey(apiKey.trim());

    try {
      await api.get("/api/health");
      // Health is public; verify the key against a protected route.
      await api.get("/api/settings");
      if (!isFaceIdEnabled() && (await isFaceIdAvailable())) {
        setOfferFaceId(true);
      } else {
        onSuccess();
      }
    } catch (err) {
      setStoredApiKey("");
      setError(
        err.status === 401
          ? "Invalid API key."
          : err.message || "Could not connect.",
      );
    } finally {
      setChecking(false);
    }
  }

  async function handleEnableFaceId() {
    setEnabling(true);
    try {
      await registerFaceId();
    } catch {
      // Optional step — if setup fails or is cancelled, just continue into
      // the app with password-only unlock. Settings has this toggle too.
    } finally {
      setEnabling(false);
      onSuccess();
    }
  }

  if (offerFaceId) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-sm bg-surface border border-line rounded-xl2 shadow-card p-8 space-y-5 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent-light text-accent mx-auto">
            <ScanFace size={22} />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl text-ink-900">
              Enable Face ID?
            </h1>
            <p className="text-sm text-ink-500 mt-1">
              Unlock Ledger with Face ID instead of typing your password every
              time. You can turn this off anytime in Settings.
            </p>
          </div>
          <div className="space-y-2">
            <button
              onClick={handleEnableFaceId}
              disabled={enabling}
              className="w-full bg-accent hover:bg-accent-dark disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
            >
              {enabling ? "Setting up…" : "Enable Face ID"}
            </button>
            <button
              onClick={onSuccess}
              className="w-full text-sm font-medium text-ink-500 hover:text-ink-900 px-4 py-2 rounded-lg"
            >
              Not Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-surface border border-line rounded-xl2 shadow-card p-8 space-y-5">
        <div className="text-center space-y-2">
          <Logo size={64} className="mx-auto" />
          <h1 className="font-display font-bold text-xl text-ink-900">
            Ledger Financial
          </h1>
          <p className="text-sm text-ink-500">
            Enter your password to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-500 uppercase tracking-wide mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoFocus
              required
              className="w-full text-sm rounded-lg border border-line px-3 py-2"
              placeholder="Paste the password here"
            />
          </div>

          {error && <p className="text-sm text-over">{error}</p>}

          <button
            type="submit"
            disabled={checking || !apiKey.trim()}
            className="w-full bg-accent hover:bg-accent-dark disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            {checking ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
