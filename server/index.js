import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { readCache, refreshCache } from "./cache.js";
import { EXCHANGES, STABLE_COINS } from "./config.js";
import { EXCHANGE_META } from "../src/lib/exchanges.js";
import { recordAccess, recordExchangeClick } from "./analytics.js";
import {
  handleAdminAnalytics,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminPage,
  noIndexAdmin,
} from "./admin.js";
import {
  broadcastSnapshot,
  getVisitorStats,
  handleEvents,
  startCacheWatcher,
} from "./live-events.js";
import { installX402Routes } from "./x402-commerce.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3344;
const isProd = process.env.NODE_ENV === "production";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", "loopback");
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(noIndexAdmin);

const exchangeById = new Map(
  Object.entries(EXCHANGE_META).map(([name, meta]) => [meta.id, { name, ...meta }]),
);

function shouldRecordAccess(req) {
  if (req.method !== "GET") return false;
  if (req.path.startsWith("/api") || req.path.startsWith("/adm")) return false;
  if (path.extname(req.path)) return false;
  return true;
}

app.get(["/adm", "/adm/"], handleAdminPage);
app.post("/adm/login", handleAdminLogin);
app.post("/adm/logout", handleAdminLogout);
app.get("/api/admin/analytics", handleAdminAnalytics);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/api/meta", (_req, res) => {
  const cache = readCache();
  res.json({
    exchanges: EXCHANGES,
    stableCoins: STABLE_COINS,
    ...cache.meta,
    exchangeStatus: cache.exchangeStatus,
  });
});

app.get("/api/products", (_req, res) => {
  res.json(readCache());
});

app.get("/api/visitor-stats", (_req, res) => {
  res.json(getVisitorStats());
});

app.get("/api/events", handleEvents);
installX402Routes(app);

app.get("/api/out/:exchangeId", (req, res) => {
  const exchange = exchangeById.get(req.params.exchangeId);
  if (!exchange?.referralUrl) {
    res.status(404).json({ error: "Unknown exchange" });
    return;
  }

  recordExchangeClick(req, exchange.name).catch((err) => {
    console.warn(`[analytics] click record failed: ${err.message}`);
  });
  res.redirect(302, exchange.referralUrl);
});

app.post("/api/refresh", async (_req, res) => {
  try {
    const snapshot = await refreshCache();
    broadcastSnapshot("manual-refresh");
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (isProd) {
  const dist = path.join(__dirname, "..", "dist");
  app.use((req, _res, next) => {
    if (shouldRecordAccess(req)) {
      recordAccess(req).catch((err) => {
        console.warn(`[analytics] access record failed: ${err.message}`);
      });
    }
    next();
  });
  app.use(express.static(dist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

async function main() {
  const cache = readCache();
  if (!cache.meta?.fetchedAt) {
    console.log("[server] cache is empty; fetching CEX staking rates once...");
    await refreshCache();
  } else {
    console.log(`[server] using cache from ${cache.meta.fetchedAt}`);
  }

  startCacheWatcher();

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`[server] listening on http://127.0.0.1:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
