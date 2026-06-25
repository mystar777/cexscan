import { useCallback, useEffect, useMemo, useState } from "react";
import Dashboard from "./components/Dashboard";
import RoutePlanner from "./components/RoutePlanner";
import { formatDateTime } from "./lib/format.js";
import "./App.css";

function getVisitorId() {
  const key = "cexscan.visitorId";
  const id =
    window.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  try {
    const existing = window.localStorage?.getItem(key);
    if (existing) return existing;
    window.localStorage?.setItem(key, id);
  } catch {
    return id;
  }

  return id;
}

function VisitorStatsBadge({ stats }) {
  return (
    <div className="visitor-stats" title="Current viewers and cumulative visits">
      <span className="visitor-dot" aria-hidden="true" />
      <span>
        <strong>{stats?.online ?? "-"}</strong> watching
      </span>
      <span className="visitor-separator">|</span>
      <span>
        total <strong>{stats?.total ?? "-"}</strong> visits
      </span>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [visitorStats, setVisitorStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeView, setActiveView] = useState("dashboard");

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

    if (!("EventSource" in window)) {
      const id = setInterval(load, 5 * 60 * 1000);
      return () => clearInterval(id);
    }

    const source = new EventSource(
      `/api/events?visitorId=${encodeURIComponent(getVisitorId())}`,
    );

    source.addEventListener("snapshot", (event) => {
      try {
        const payload = JSON.parse(event.data);
        setData(payload.products);
        setMeta(payload.meta);
        setError(null);
        setLoading(false);
      } catch (err) {
        setError(err.message);
      }
    });

    source.addEventListener("stats", (event) => {
      try {
        setVisitorStats(JSON.parse(event.data));
      } catch {
        // Ignore malformed stats events; EventSource will keep the stream alive.
      }
    });

    source.onerror = () => {
      setError((current) => current ?? "Live update connection is reconnecting...");
    };

    return () => source.close();
  }, [load]);

  const exchanges = useMemo(() => meta?.exchanges ?? [], [meta]);
  const stableCoins = useMemo(() => meta?.stableCoins ?? [], [meta]);
  const logoText = "CEX Stable Staking";

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <img className="brand-logo" src="/brand/logo.svg" alt={logoText} />
            <div>
              <h1>{logoText}</h1>
              <p className="subtitle">
                Compare stablecoin staking APY across major centralized exchanges
              </p>
            </div>
          </div>
          <nav className="header-nav" aria-label="Primary">
            <button
              type="button"
              className={`route-menu-button ${activeView === "route" ? "active" : ""}`}
              onClick={() =>
                setActiveView((view) => (view === "route" ? "dashboard" : "route"))
              }
            >
              {activeView === "route" ? "Back to List" : "AI Route"}
            </button>
          </nav>
          <div className="header-meta">
            {meta?.fetchedAt && (
              <span className="meta-pill">
                Updated: {formatDateTime(meta.fetchedAt)}
              </span>
            )}
            <VisitorStatsBadge stats={visitorStats} />
          </div>
        </div>
      </header>

      <main className="main">
        {error && <div className="banner error">{error}</div>}
        {loading && !data ? (
          <div className="loading">Loading data...</div>
        ) : activeView === "route" ? (
          <RoutePlanner
            products={data?.products ?? []}
            stableCoins={stableCoins}
            meta={meta}
          />
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
          Synced every 1 hour by Codex automation via public APIs, exchange Earn pages,
          and notices. Sources include Bybit, OKX, Gate.io, Bitget, MEXC, HTX,
          Kraken, Crypto.com, LBank, and BingX where publicly available.
        </p>
      </footer>
    </div>
  );
}
