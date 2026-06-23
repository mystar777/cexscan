import { useCallback, useEffect, useMemo, useState } from "react";
import Dashboard from "./components/Dashboard";
import { formatDateTime } from "./lib/format.js";
import "./App.css";

export default function App() {
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productsRes, metaRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/meta"),
      ]);
      if (!productsRes.ok || !metaRes.ok) throw new Error("API error");
      const productsData = await productsRes.json();
      const metaData = await metaRes.json();
      setData(productsData);
      setMeta(metaData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const exchanges = useMemo(() => meta?.exchanges ?? [], [meta]);
  const stableCoins = useMemo(() => meta?.stableCoins ?? [], [meta]);

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-icon">◈</span>
            <div>
              <h1>CEX Stable Staking</h1>
              <p className="subtitle">
                Compare stablecoin staking APY across CMC top 10 exchanges
              </p>
            </div>
          </div>
          <div className="header-meta">
            {meta?.fetchedAt && (
              <span className="meta-pill">
                Updated: {formatDateTime(meta.fetchedAt)}
              </span>
            )}
            {meta?.nextFetchAt && (
              <span className="meta-pill muted">
                Next sync: {formatDateTime(meta.nextFetchAt)}
              </span>
            )}
            <button
              type="button"
              className={`btn-refresh${loading ? " is-spinning" : ""}`}
              onClick={load}
              disabled={loading}
              aria-label="Refresh"
              title="Refresh"
            >
              <svg
                className="refresh-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 3v6h-6" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        {error && <div className="banner error">{error}</div>}
        {loading && !data ? (
          <div className="loading">Loading data…</div>
        ) : (
          <Dashboard
            products={data?.products ?? []}
            exchangeStatus={data?.exchangeStatus ?? meta?.exchangeStatus ?? []}
            exchanges={exchanges}
            stableCoins={stableCoins}
          />
        )}
      </main>

      <footer className="footer">
        <p>
          Auto-sync every 30 min via public APIs and exchange announcements · Bybit · OKX ·
          Gate.io API · other exchanges supplemented from notices
        </p>
      </footer>
    </div>
  );
}
