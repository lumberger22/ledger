import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
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
import { api, clearStoredApiKey, getStoredApiKey } from "./api/client";

export default function App() {
  const [authState, setAuthState] = useState("checking"); // 'checking' | 'locked' | 'unlocked'

  useEffect(() => {
    async function checkAuth() {
      const key = getStoredApiKey();
      if (!key) {
        // No stored key — probe whether the server requires auth at all.
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
        setAuthState("unlocked");
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

  function handleLoginSuccess() {
    setAuthState("unlocked");
  }

  function handleLogout() {
    clearStoredApiKey();
    setAuthState("locked");
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
          </Routes>
        </main>
      </div>
    </UploadModalProvider>
  );
}
