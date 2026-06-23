import { useMemo, useState } from "react";
import Filters from "./Filters";
import ProductsTable from "./ProductsTable";
import ExchangeStatus from "./ExchangeStatus";
import "./Dashboard.css";

const DEFAULT_SORT = { key: "apy", dir: "desc" };

export default function Dashboard({ products, exchangeStatus, exchanges, stableCoins }) {
  const [search, setSearch] = useState("");
  const [selectedCoins, setSelectedCoins] = useState([]);
  const [selectedExchanges, setSelectedExchanges] = useState([]);
  const [durationFilter, setDurationFilter] = useState("all");
  const [productTypeFilter, setProductTypeFilter] = useState("all");
  const [sort, setSort] = useState(DEFAULT_SORT);

  const filtered = useMemo(() => {
    let list = [...products];

    if (selectedCoins.length) {
      list = list.filter((p) => selectedCoins.includes(p.asset));
    }
    if (selectedExchanges.length) {
      list = list.filter((p) => selectedExchanges.includes(p.exchange));
    }
    if (durationFilter === "flexible") {
      list = list.filter((p) => p.durationDays === 0 || p.productType === "flexible");
    } else if (durationFilter === "locked") {
      list = list.filter((p) => p.durationDays > 0);
    }
    if (productTypeFilter !== "all") {
      list = list.filter((p) => p.productType === productTypeFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.asset.toLowerCase().includes(q) ||
          p.exchange.toLowerCase().includes(q) ||
          p.duration.toLowerCase().includes(q),
      );
    }

    const { key, dir } = sort;
    list.sort((a, b) => {
      let av = a[key];
      let bv = b[key];
      if (key === "apy") {
        av = a.apyMax ?? a.apy ?? 0;
        bv = b.apyMax ?? b.apy ?? 0;
      }
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [
    products,
    selectedCoins,
    selectedExchanges,
    durationFilter,
    productTypeFilter,
    search,
    sort,
  ]);

  const stats = useMemo(() => {
    if (!filtered.length) return null;
    const apys = filtered.map((p) => p.apyMax ?? p.apy ?? 0);
    return {
      count: filtered.length,
      maxApy: Math.max(...apys),
      avgApy: apys.reduce((a, b) => a + b, 0) / apys.length,
    };
  }, [filtered]);

  function toggleSort(key) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "apy" ? "desc" : "asc" },
    );
  }

  return (
    <div className="dashboard">
      <ExchangeStatus status={exchangeStatus} exchanges={exchanges} />

      {stats && (
        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-label">Pools</span>
            <span className="stat-value">{stats.count}</span>
          </div>
          <div className="stat-card highlight">
            <span className="stat-label">Top APY</span>
            <span className="stat-value apy">{stats.maxApy.toFixed(2)}%</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Avg APY</span>
            <span className="stat-value">{stats.avgApy.toFixed(2)}%</span>
          </div>
        </div>
      )}

      <Filters
        search={search}
        onSearchChange={setSearch}
        stableCoins={stableCoins}
        selectedCoins={selectedCoins}
        onCoinsChange={setSelectedCoins}
        exchanges={exchanges}
        selectedExchanges={selectedExchanges}
        onExchangesChange={setSelectedExchanges}
        durationFilter={durationFilter}
        onDurationChange={setDurationFilter}
        productTypeFilter={productTypeFilter}
        onProductTypeChange={setProductTypeFilter}
        onReset={() => {
          setSearch("");
          setSelectedCoins([]);
          setSelectedExchanges([]);
          setDurationFilter("all");
          setProductTypeFilter("all");
          setSort(DEFAULT_SORT);
        }}
      />

      <ProductsTable rows={filtered} sort={sort} onSort={toggleSort} />
    </div>
  );
}
