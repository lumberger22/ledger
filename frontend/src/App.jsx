import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import NavBar from "./components/NavBar";
import { UploadModalProvider } from "./context/UploadModalContext";
import Dashboard from "./pages/Dashboard";
import Charges from "./pages/Charges";
import UploadPreview from "./pages/UploadPreview";
import Budget from "./pages/Budget";
import Analysis from "./pages/Analysis";
import Settings from "./pages/Settings";
import Income from "./pages/Income";
import Accounts from "./pages/Accounts";
import Investments from "./pages/Investments";
import NetWorth from "./pages/NetWorth";
import Login from "./pages/Login";
import FaceIdGate from "./components/FaceIdGate";
import { api, clearStoredApiKey, getStoredApiKey } from "./api/client";
import { isFaceIdEnabled } from "./api/webauthn";

// Fixed paths used any time we reset navigation state on the user, so the
// app never leaves someone parked on a URL for a page they can no longer
// (or don't yet) have access to.
const LOGIN_PATH = "/login";
const STABLE_PATH = "/";

export default function App() {
  // 'checking' | 'locked' | 'faceid-gate' | 'unlocked'
  const [authState, setAuthState] = useState("checking");
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    async function checkAuth() {
      const key = getStoredApiKey();
      if (!key) {
        // No stored key — probe whether the server requires auth at all.
        // (No password stored means no Face ID gate either — there'd be
        // nothing for it to protect.)
        try {
          await api.get("/api/settings");
          setAuthState("unlocked");
        } catch (err) {
          setAuthState(err.status === 401 ? "locked" : "unlocked");
        }
        return;
      }

      try {
        await api.get("/api/settings");
        setAuthState(isFaceIdEnabled() ? "faceid-gate" : "unlocked");
      } catch {
        setAuthState("locked");
      }
    }

    checkAuth();

    function onUnauthorized() {
      setAuthState("locked");
    }
    window.addEventListener("budget-app-unauthorized", onUnauthorized);
    return () =>
      window.removeEventListener("budget-app-unauthorized", onUnauthorized);
  }, []);

  // Whenever we're not authenticated, make sure the address bar actually
  // shows /login instead of leaving whatever deep link was requested (e.g.
  // /settings) sitting behind the lock screen. Remembers where you were
  // trying to go so a successful login can send you back there.
  useEffect(() => {
    if (authState === "locked" && location.pathname !== LOGIN_PATH) {
      navigate(LOGIN_PATH, { replace: true, state: { from: location } });
    }
  }, [authState, location, navigate]);

  // Re-lock behind Face ID whenever the app is brought back to the
  // foreground (tab/app switch, screen lock, etc.) — this is what makes it
  // feel like an actual app lock rather than a one-time login gate.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible" && isFaceIdEnabled()) {
        setAuthState((current) => (current === "unlocked" ? "faceid-gate" : current));
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (authState === "unlocked") {
      window.scrollTo(0, 0);
    }
  }, [authState]);

  function handleLoginSuccess() {
    setAuthState("unlocked");
    const from = location.state?.from?.pathname;
    navigate(from && from !== LOGIN_PATH ? from : STABLE_PATH, { replace: true });
  }

  function handleFaceIdSuccess() {
    setAuthState("unlocked");
  }

  function handleUsePassword() {
    setAuthState("locked");
  }

  function handleLogout() {
    clearStoredApiKey();
    setAuthState("locked");
    // Reset to a stable, known path rather than leaving the lock screen
    // rendered on top of whatever route was open (e.g. /settings) —
    // logging back in should start fresh, not silently resume mid-page.
    navigate(LOGIN_PATH, { replace: true });
  }

  if (authState === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-ink-500">Loading…</p>
      </div>
    );
  }

  if (authState === "locked") {
    return <Login onSuccess={handleLoginSuccess} />;
  }

  if (authState === "faceid-gate") {
    return (
      <FaceIdGate
        onSuccess={handleFaceIdSuccess}
        onUsePassword={handleUsePassword}
      />
    );
  }

  return (
    <UploadModalProvider>
      <div className="min-h-screen">
        <NavBar onLogout={handleLogout} />
        <main className="max-w-6xl mx-auto px-4 py-5 sm:px-6 sm:py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/investments" element={<Investments />} />
            <Route path="/net-worth" element={<NetWorth />} />
            <Route path="/charges" element={<Charges />} />
            <Route path="/upload-preview" element={<UploadPreview />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/income" element={<Income />} />
            {/* Already authenticated and hit /login (e.g. typed manually,
                back button, stale tab) — send back into the app instead of
                rendering nothing under the NavBar. */}
            <Route path={LOGIN_PATH} element={<Navigate to={STABLE_PATH} replace />} />
            <Route path="*" element={<Navigate to={STABLE_PATH} replace />} />
          </Routes>
        </main>
      </div>
    </UploadModalProvider>
  );
}
