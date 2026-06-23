import HorizontalCarousel from "./HorizontalCarousel";
import "./Filters.css";

export default function Filters({
  search,
  onSearchChange,
  stableCoins,
  selectedCoins,
  onCoinsChange,
  exchanges,
  selectedExchanges,
  onExchangesChange,
  durationFilter,
  onDurationChange,
  productTypeFilter,
  onProductTypeChange,
  onReset,
}) {
  function toggleCoin(coin) {
    onCoinsChange(
      selectedCoins.includes(coin)
        ? selectedCoins.filter((c) => c !== coin)
        : [...selectedCoins, coin],
    );
  }

  function toggleExchange(id) {
    const name = exchanges.find((e) => e.id === id)?.name;
    if (!name) return;
    onExchangesChange(
      selectedExchanges.includes(name)
        ? selectedExchanges.filter((e) => e !== name)
        : [...selectedExchanges, name],
    );
  }

  const availableCoins = [
    ...new Set(stableCoins.length ? stableCoins : ["USDT", "USDC", "DAI"]),
  ];

  return (
    <section className="filters">
      <HorizontalCarousel label="Options" className="filters-options">
        <label className="filter-group grow">
          <span className="filter-label">Search</span>
          <input
            type="search"
            placeholder="Coin, exchange, duration…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </label>

        <label className="filter-group">
          <span className="filter-label">Duration</span>
          <select value={durationFilter} onChange={(e) => onDurationChange(e.target.value)}>
            <option value="all">All</option>
            <option value="flexible">Flexible</option>
            <option value="locked">Locked</option>
          </select>
        </label>

        <label className="filter-group">
          <span className="filter-label">Product type</span>
          <select
            value={productTypeFilter}
            onChange={(e) => onProductTypeChange(e.target.value)}
          >
            <option value="all">All</option>
            <option value="flexible">Flexible Savings</option>
            <option value="onchain">On-chain</option>
            <option value="locked">Locked</option>
          </select>
        </label>

        <button type="button" className="btn-reset" onClick={onReset}>
          Reset filters
        </button>
      </HorizontalCarousel>

      <HorizontalCarousel label="Coins">
        {availableCoins.map((coin) => (
          <button
            key={coin}
            type="button"
            className={`chip ${selectedCoins.includes(coin) ? "active" : ""} ${coin === "USD1" ? "hot" : ""}`}
            onClick={() => toggleCoin(coin)}
          >
            {coin}
            {coin === "USD1" && <span className="hot-badge">HOT</span>}
          </button>
        ))}
      </HorizontalCarousel>

      <HorizontalCarousel label="Exchange">
        {exchanges.map((ex) => (
          <button
            key={ex.id}
            type="button"
            className={`chip ${selectedExchanges.includes(ex.name) ? "active" : ""}`}
            onClick={() => toggleExchange(ex.id)}
            title={ex.name}
          >
            {ex.name}
          </button>
        ))}
      </HorizontalCarousel>
    </section>
  );
}
