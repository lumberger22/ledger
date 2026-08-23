import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { usePlaidLink } from "react-plaid-link";
import {
  Landmark,
  Plus,
  RefreshCw,
  Unplug,
  AlertTriangle,
  Wallet,
  Trash2,
  Eye,
  EyeOff,
  Check,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  createLinkToken,
  exchangePublicToken,
  listPlaidItems,
  removePlaidItem,
  triggerSync,
} from "../api/plaid";
import {
  listAccounts,
  createManualAccount,
  updateAccount,
  deleteAccount,
} from "../api/accounts";
import { getPlaidPending } from "../api/upload";
import EmptyState from "../components/EmptyState";

const currency = (n) =>
  `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_COPY = {
  good: { label: "Connected", color: "text-good", bg: "bg-good/10" },
  login_required: {
    label: "Needs reconnect",
    color: "text-warn",
    bg: "bg-warn/10",
  },
  error: { label: "Sync error", color: "text-over", bg: "bg-over/10" },
};

const ACCOUNT_TYPES = ["depository", "credit", "investment", "loan"];

// Persists the in-flight link_token across the full-page redirect an OAuth
// institution (Wells Fargo, most large banks) sends the browser through —
// popups mostly don't work inside an installed home-screen web app on iOS,
// so that redirect replaces this page rather than opening a new window.
// Plaid's own Link SDK example uses localStorage for exactly this reason:
// it has to survive that navigation. See PLAID_REDIRECT_URI in the backend
// config for the other half of this.
const PLAID_OAUTH_LINK_TOKEN_KEY = "plaid_oauth_link_token";

export default function Accounts() {
  const [items, setItems] = useState([]);
  const [manualAccounts, setManualAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [linkToken, setLinkToken] = useState(null);
  const [pendingOpen, setPendingOpen] = useState(false);
  // Set only while resuming an OAuth institution's Link session after the
  // bank redirects back here (see the mount effect below) — never during a
  // normal, same-session connect.
  const oauthRedirectUriRef = useRef(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualDraft, setManualDraft] = useState({
    name: "",
    type: "depository",
    current_balance: "",
  });
  // Which institutions' account lists are expanded, keyed by plaid_item_id.
  // Missing from this map means expanded — new/first-seen items default open.
  const [expanded, setExpanded] = useState({});
  const [plaidPendingCount, setPlaidPendingCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, accountsRes] = await Promise.all([
        listPlaidItems(),
        listAccounts(),
      ]);
      setItems(itemsRes.items);
      setManualAccounts(accountsRes.accounts.filter((a) => a.is_manual));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshPlaidPendingCount = useCallback(() => {
    getPlaidPending()
      .then((res) => setPlaidPendingCount(res.total))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    refreshPlaidPendingCount();
  }, [load, refreshPlaidPendingCount]);

  function toggleExpanded(itemId) {
    setExpanded((prev) => ({ ...prev, [itemId]: prev[itemId] === false }));
  }

  function cleanUpOAuthResume() {
    if (!oauthRedirectUriRef.current) return;
    oauthRedirectUriRef.current = null;
    localStorage.removeItem(PLAID_OAUTH_LINK_TOKEN_KEY);
    window.history.replaceState(null, "", window.location.pathname);
  }

  const { open, ready } = usePlaidLink({
    token: linkToken,
    // Only meaningful (and only set) when resuming after an OAuth
    // institution's redirect back to this page — see the mount effect
    // below. Plaid's SDK ignores this otherwise.
    receivedRedirectUri: oauthRedirectUriRef.current || undefined,
    onSuccess: async (publicToken, metadata) => {
      try {
        await exchangePublicToken(
          publicToken,
          metadata.institution?.institution_id,
          metadata.institution?.name,
        );
        await load();
      } catch (err) {
        setError(err.message || "Couldn't finish connecting that account.");
      } finally {
        setConnecting(false);
        setLinkToken(null);
        cleanUpOAuthResume();
      }
    },
    onExit: (err) => {
      setConnecting(false);
      setLinkToken(null);
      if (err) {
        // Institution-specific OAuth failures (pending approval, a required
        // security questionnaire, etc.) surface here rather than as a
        // silent dead end — see Plaid's OAuth guide for what these can be.
        setError(
          err.display_message ||
            err.error_message ||
            "Couldn't finish connecting that account.",
        );
      }
      cleanUpOAuthResume();
    },
  });

  useEffect(() => {
    if (linkToken && ready && pendingOpen) {
      setPendingOpen(false);
      open();
    }
  }, [linkToken, ready, pendingOpen, open]);

  // Resume an OAuth institution's Link session after its bank redirects the
  // browser back here. Plaid appends `oauth_state_id` to whatever
  // redirect_uri is registered (PLAID_REDIRECT_URI on the backend, which
  // Ledger points at this same Accounts page) — this only ever needs to run
  // once, right on mount, before anything else touches linkToken.
  useEffect(() => {
    if (!window.location.search.includes("oauth_state_id")) return;

    const storedToken = localStorage.getItem(PLAID_OAUTH_LINK_TOKEN_KEY);
    if (!storedToken) {
      setError(
        "That bank connection session expired, or was opened in a different browser — try connecting again.",
      );
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    oauthRedirectUriRef.current = window.location.href;
    setError(null);
    setConnecting(true);
    setLinkToken(storedToken);
    setPendingOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect(itemId) {
    setError(null);
    setConnecting(true);
    try {
      const { link_token } = await createLinkToken(itemId);
      // Must be persisted before open() — an OAuth institution can navigate
      // this whole page away to the bank's login before returning.
      localStorage.setItem(PLAID_OAUTH_LINK_TOKEN_KEY, link_token);
      setLinkToken(link_token);
      setPendingOpen(true);
    } catch (err) {
      setError(
        err.status === 503
          ? "Plaid isn't configured on the server yet — set PLAID_CLIENT_ID / PLAID_SECRET / PLAID_TOKEN_ENCRYPTION_KEY."
          : err.message || "Couldn't start Plaid Link.",
      );
      setConnecting(false);
    }
  }

  async function handleDisconnect(item) {
    if (
      !confirm(
        `Disconnect ${item.institution_name || "this institution"}? Past charges stay, but balances and new transactions will stop syncing.`,
      )
    ) {
      return;
    }
    await removePlaidItem(item.plaid_item_id);
    load();
  }

  async function handleSync(itemId) {
    setSyncing(true);
    try {
      await triggerSync(itemId);
      await load();
      refreshPlaidPendingCount();
    } finally {
      setSyncing(false);
    }
  }

  async function handleAddManual(e) {
    e.preventDefault();
    await createManualAccount({
      ...manualDraft,
      current_balance: parseFloat(manualDraft.current_balance) || 0,
    });
    setManualDraft({ name: "", type: "depository", current_balance: "" });
    setShowManualForm(false);
    load();
  }

  async function handleHideManual(id, hide) {
    await updateAccount(id, { is_hidden: hide });
    load();
  }

  async function handleDeleteManual(id) {
    if (!confirm("Remove this manual account?")) return;
    await deleteAccount(id);
    load();
  }

  if (loading) return <p className="text-sm text-ink-500">Loading…</p>;

  const hasAnything = items.length > 0 || manualAccounts.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display font-bold text-xl sm:text-2xl text-ink-900">
          Accounts
        </h1>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          {plaidPendingCount > 0 && (
            <Link
              to="/upload-preview?source=plaid"
              className="flex items-center justify-center gap-1.5 text-sm font-semibold text-accent-dark bg-accent-light hover:bg-accent-light/70 px-3 py-1.5 rounded-lg transition-colors"
            >
              {plaidPendingCount} to review
            </Link>
          )}
          {items.length > 0 && (
            <button
              onClick={() => handleSync()}
              disabled={syncing}
              className="flex items-center justify-center gap-1.5 text-sm font-semibold text-ink-700 border border-line hover:bg-black/5 disabled:opacity-60 px-3 py-1.5 rounded-lg"
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing…" : "Sync Now"}
            </button>
          )}
          <button
            onClick={() => setShowManualForm((v) => !v)}
            className="flex items-center justify-center gap-1.5 text-sm font-semibold text-ink-700 border border-line hover:bg-black/5 px-3 py-1.5 rounded-lg"
          >
            <Plus size={14} /> Manual Account
          </button>
          <button
            onClick={() => handleConnect()}
            disabled={connecting}
            className="flex items-center justify-center gap-1.5 bg-accent hover:bg-accent-dark text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors shadow-card disabled:opacity-60"
          >
            <Landmark size={15} />{" "}
            {connecting ? "Connecting…" : "Connect Account"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-over/5 border border-over/30 rounded-xl2 p-4 text-sm text-over flex items-center gap-2">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {showManualForm && (
        <form
          onSubmit={handleAddManual}
          className="bg-surface border border-line rounded-xl2 shadow-card p-4 sm:p-5 flex flex-wrap items-end gap-3"
        >
          <div className="w-full sm:w-auto">
            <label className="block text-xs font-medium text-ink-500 uppercase tracking-wide mb-1.5">
              Name
            </label>
            <input
              required
              value={manualDraft.name}
              onChange={(e) =>
                setManualDraft({ ...manualDraft, name: e.target.value })
              }
              placeholder="Cash, Venmo, …"
              className="text-sm rounded-lg border border-line px-3 py-2 w-full sm:w-48"
            />
          </div>
          <div className="w-full sm:w-auto">
            <label className="block text-xs font-medium text-ink-500 uppercase tracking-wide mb-1.5">
              Type
            </label>
            <select
              value={manualDraft.type}
              onChange={(e) =>
                setManualDraft({ ...manualDraft, type: e.target.value })
              }
              className="text-sm rounded-lg border border-line px-3 py-2 w-full sm:w-auto"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-auto">
            <label className="block text-xs font-medium text-ink-500 uppercase tracking-wide mb-1.5">
              Balance
            </label>
            <input
              type="number"
              step="0.01"
              value={manualDraft.current_balance}
              onChange={(e) =>
                setManualDraft({
                  ...manualDraft,
                  current_balance: e.target.value,
                })
              }
              className="text-sm rounded-lg border border-line px-3 py-2 w-full sm:w-32 tabular"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="submit"
              className="flex items-center justify-center gap-1 text-sm font-semibold text-white bg-accent hover:bg-accent-dark px-3.5 py-2 rounded-lg flex-1 sm:flex-none"
            >
              <Check size={14} /> Add
            </button>
            <button
              type="button"
              onClick={() => setShowManualForm(false)}
              className="flex items-center justify-center gap-1 text-sm font-medium text-ink-500 px-3 py-2 rounded-lg hover:bg-black/5 flex-1 sm:flex-none"
            >
              <X size={14} /> Cancel
            </button>
          </div>
        </form>
      )}

      {!hasAnything ? (
        <div className="bg-surface border border-line rounded-xl2 shadow-card">
          <EmptyState
            icon={Landmark}
            title="No accounts connected yet"
            message="Connect Wells Fargo, Fidelity, Charles Schwab, or another institution to pull in balances and transactions automatically."
            showUpload={false}
          />
        </div>
      ) : (
        <>
          {items.map((item) => {
            const status = STATUS_COPY[item.status] || STATUS_COPY.error;
            const isExpanded = expanded[item.plaid_item_id] !== false;
            const accountCount = item.accounts.length;
            const combinedBalance = item.accounts.reduce(
              (sum, a) => sum + (a.current_balance ?? 0),
              0,
            );
            return (
              <div
                key={item.plaid_item_id}
                className="bg-surface border border-line rounded-xl2 shadow-card overflow-hidden"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpanded(item.plaid_item_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpanded(item.plaid_item_id);
                    }
                  }}
                  aria-expanded={isExpanded}
                  className={`w-full flex items-center justify-between gap-2 p-3 sm:p-4 text-left cursor-pointer hover:bg-black/[0.015] transition-colors ${isExpanded ? "border-b border-line" : ""}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-accent-light flex items-center justify-center shrink-0">
                      <Landmark size={16} className="text-accent-dark" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-display font-semibold text-ink-900 truncate">
                        {item.institution_name || "Connected institution"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}
                        >
                          {status.label}
                        </span>
                        <span className="text-xs text-ink-500 tabular">
                          {accountCount} account{accountCount !== 1 ? "s" : ""}
                          {accountCount > 0
                            ? ` · ${currency(combinedBalance)}`
                            : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === "login_required" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConnect(item.plaid_item_id);
                        }}
                        className="text-sm font-semibold text-accent hover:text-accent-dark"
                      >
                        Reconnect
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDisconnect(item);
                      }}
                      title="Disconnect"
                      className="p-2 rounded-lg text-ink-500 hover:bg-black/5 hover:text-over"
                    >
                      <Unplug size={15} />
                    </button>
                    {isExpanded ? (
                      <ChevronDown
                        size={16}
                        className="text-ink-500 shrink-0"
                      />
                    ) : (
                      <ChevronRight
                        size={16}
                        className="text-ink-500 shrink-0"
                      />
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="divide-y divide-line">
                    {item.accounts.length === 0 ? (
                      <p className="text-sm text-ink-500 p-4">
                        No accounts synced yet.
                      </p>
                    ) : (
                      item.accounts.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between gap-2 p-3 sm:p-4"
                        >
                          <div>
                            <p className="text-sm font-medium text-ink-900">
                              {a.name}
                            </p>
                            <p className="text-xs text-ink-500">
                              {a.type} {a.mask ? `···· ${a.mask}` : ""}
                              {a.type === "investment" && (
                                <>
                                  {" · "}
                                  <Link
                                    to="/investments"
                                    className="font-medium text-accent hover:text-accent-dark"
                                  >
                                    Holdings →
                                  </Link>
                                </>
                              )}
                            </p>
                          </div>
                          <span className="text-sm font-medium tabular text-ink-900">
                            {currency(a.current_balance)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {manualAccounts.length > 0 && (
            <div className="bg-surface border border-line rounded-xl2 shadow-card overflow-hidden">
              <div className="flex items-center gap-3 p-4 border-b border-line">
                <div className="w-9 h-9 rounded-full bg-black/[0.05] flex items-center justify-center shrink-0">
                  <Wallet size={16} className="text-ink-500" />
                </div>
                <p className="font-display font-semibold text-ink-900">
                  Manual Accounts
                </p>
              </div>
              <div className="divide-y divide-line">
                {manualAccounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-4"
                  >
                    <div className={a.is_hidden ? "opacity-40" : ""}>
                      <p className="text-sm font-medium text-ink-900">
                        {a.name}
                      </p>
                      <p className="text-xs text-ink-500">{a.type}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium tabular text-ink-900">
                        {currency(a.current_balance)}
                      </span>
                      <button
                        onClick={() => handleHideManual(a.id, !a.is_hidden)}
                        title={a.is_hidden ? "Unhide" : "Hide"}
                        className="p-1.5 rounded-md text-ink-500 hover:bg-black/5"
                      >
                        {a.is_hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button
                        onClick={() => handleDeleteManual(a.id)}
                        title="Delete"
                        className="p-1.5 rounded-md text-ink-500 hover:bg-black/5 hover:text-over"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
