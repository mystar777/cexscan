import { useState } from "react";
import HorizontalCarousel from "./HorizontalCarousel";
import { getExchangeMeta } from "../lib/exchanges";
import { tagClassName } from "../lib/productTags";
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
  productTypeOptions = [],
  onProductTypeChange,
  eligibilityFilter,
  onEligibilityChange,
  onReset,
}) {
  const [isOpen, setIsOpen] = useState(false);

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
  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    selectedCoins.length +
    selectedExchanges.length +
    (durationFilter !== "all" ? 1 : 0) +
    (productTypeFilter !== "all" ? 1 : 0) +
    (eligibilityFilter !== "all" ? 1 : 0);

  return (
    <section className="filters">
      <button
        type="button"
        className="filters-toggle"
        aria-expanded={isOpen}
        aria-controls="filters-body"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="filters-title">Options</span>
        {activeFilterCount > 0 && (
          <span className="filters-active-count">{activeFilterCount} active</span>
        )}
        <svg
          className="filters-toggle-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div id="filters-body" className="filters-body" hidden={!isOpen}>
        <HorizontalCarousel label="Options" className="filters-options">
          <label className="filter-group grow">
            <span className="filter-label">Search</span>
            <input
              type="search"
              placeholder="Coin, exchange, duration..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </label>

          <label className="filter-group">
            <span className="filter-label">Duration</span>
            <select
              value={durationFilter}
              onChange={(e) => onDurationChange(e.target.value)}
            >
              <option value="all">All</option>
              <option value="flexible">Flexible</option>
              <option value="locked">Locked</option>
            </select>
          </label>

          <label className="filter-group">
            <span className="filter-label">Eligibility</span>
            <select
              value={eligibilityFilter}
              onChange={(e) => onEligibilityChange(e.target.value)}
            >
              <option value="all">All</option>
              <option value="standard">Standard only</option>
              <option value="restricted">Restricted only</option>
            </select>
          </label>

          <button type="button" className="btn-reset" onClick={onReset}>
            Reset filters
          </button>
        </HorizontalCarousel>

        <HorizontalCarousel label="Type" className="type-filter-carousel">
          <button
            type="button"
            className={`type-chip all ${productTypeFilter === "all" ? "active" : ""}`}
            onClick={() => onProductTypeChange("all")}
          >
            All
          </button>
          {productTypeOptions.map((option) => {
            const active = productTypeFilter === option.tag;
            return (
              <button
                key={option.tag}
                type="button"
                className={`type-chip ${tagClassName(option.tag)} ${active ? "active" : ""}`}
                onClick={() => onProductTypeChange(option.tag)}
                title={option.label}
              >
                {option.label}
              </button>
            );
          })}
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
          {exchanges.map((ex) => {
            const meta = getExchangeMeta(ex.name);
            return (
              <button
                key={ex.id}
                type="button"
                className={`chip exchange-chip ${
                  selectedExchanges.includes(ex.name) ? "active" : ""
                }`}
                onClick={() => toggleExchange(ex.id)}
                title={ex.name}
              >
                <img
                  src={meta.icon}
                  alt=""
                  className="exchange-chip-icon"
                  loading="lazy"
                  draggable={false}
                />
                <span>{ex.name}</span>
              </button>
            );
          })}
        </HorizontalCarousel>
      </div>
    </section>
  );
}
