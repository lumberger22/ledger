import { useEffect, useState } from "react";
import { ScanFace } from "lucide-react";
import { verifyFaceId } from "../api/webauthn";

export default function FaceIdGate({ onSuccess, onUsePassword }) {
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [tried, setTried] = useState(false);

  async function attempt() {
    setChecking(true);
    setError("");
    setTried(true);
    try {
      const ok = await verifyFaceId();
      if (ok) {
        onSuccess();
      } else {
        setError("Face ID isn't set up on this device. Use your password instead.");
      }
    } catch {
      setError("Face ID didn't complete. Try again, or use your password.");
    } finally {
      setChecking(false);
    }
  }

  // Attempt once automatically on mount. iOS sometimes requires a direct
  // tap to actually surface the system prompt, so this can silently no-op —
  // the "Unlock with Face ID" button below is the reliable path either way.
  useEffect(() => {
    attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-surface border border-line rounded-xl2 shadow-card p-8 space-y-5 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent-light text-accent mx-auto">
          <ScanFace size={22} />
        </div>
        <div>
          <h1 className="font-display font-bold text-xl text-ink-900">
            Ledger Financial
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            {checking && !tried ? "Checking…" : "Unlock with Face ID to continue."}
          </p>
        </div>

        {error && <p className="text-sm text-over">{error}</p>}

        <div className="space-y-2">
          <button
            onClick={attempt}
            disabled={checking}
            className="w-full bg-accent hover:bg-accent-dark disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            {checking ? "Checking…" : "Unlock with Face ID"}
          </button>
          <button
            onClick={onUsePassword}
            className="w-full text-sm font-medium text-ink-500 hover:text-ink-900 px-4 py-2 rounded-lg"
          >
            Use Password Instead
          </button>
        </div>
      </div>
    </div>
  );
}
