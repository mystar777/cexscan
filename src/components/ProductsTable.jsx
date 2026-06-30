import { useRef } from "react";
import { useDragScroll } from "../hooks/useDragScroll";
import { ExchangeLink } from "./ExchangeBrand";
import { getProductTypeBadges, tagClassName } from "../lib/productTags";
import "./ExchangeBrand.css";
import "./ProductsTable.css";

function SortIcon({ active, dir }) {
  if (!active) return <span className="sort-icon">↕</span>;
  return <span className="sort-icon active">{dir === "asc" ? "↑" : "↓"}</span>;
}

function formatApy(row, { showMin = true } = {}) {
  const max = row.apyMax ?? row.apy;
  const min = row.apyMin;
  if (showMin && min != null && max != null && Math.abs(min - max) > 0.01) {
    return (
      <span className="apy-range">
        <strong>{max.toFixed(2)}%</strong>
        <span className="apy-tier"> (≤{min.toFixed(2)}%)</span>
      </span>
    );
  }
  return <strong className="apy-single">{max?.toFixed(2) ?? "—"}%</strong>;
}

function TypeBadge({ badge }) {
  return (
    <span className={`type-badge ${tagClassName(badge.tag)}`} title={badge.label}>
      {badge.label}
    </span>
  );
}

function TypeBadges({ row }) {
  return (
    <>
      {getProductTypeBadges(row).map((badge) => (
        <TypeBadge key={badge.key} badge={badge} />
      ))}
      <RestrictedBadge row={row} />
    </>
  );
}

function getEligibilityText(row) {
  if (row.eligibility?.summary) return row.eligibility.summary;
  const requirements = Array.isArray(row.eligibility?.requirements)
    ? row.eligibility.requirements
    : [];
  if (requirements.length) return `Eligibility: ${requirements.join("; ")}`;
  return row.restricted ? "Restricted eligibility." : "";
}

function RestrictedBadge({ row }) {
  const text = getEligibilityText(row);
  if (!text) return null;
  return (
    <span className="type-badge restricted" title={text}>
      Restricted
    </span>
  );
}

function PoolAsset({ asset, tiered }) {
  return (
    <div className="pool-asset">
      <span className="asset-badge">{asset}</span>
      {tiered && <span className="tag">Tiered</span>}
    </div>
  );
}

function SourceTags({ row }) {
  const label =
    row.source === "announcement" ? "Notice" : row.source === "site" ? "Site" : "API";
  return (
    <>
      <span className={`source-tag ${row.source || "api"}`}>
        {label}
      </span>
      {row.sources?.includes("announcement") && row.sources.length > 1 && (
        <span className="source-tag both">+Notice</span>
      )}
    </>
  );
}

function NoteCell({ row }) {
  const eligibilityText = getEligibilityText(row);
  const text = [row.note ?? "Notice", eligibilityText].filter(Boolean).join(" | ");
  const href = row.announcementUrl || row.sourceUrl;
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="ann-link"
        title={text || "View notice"}
      >
        {text}
      </a>
    );
  }
  return text ? <span title={text}>{text}</span> : "";
}

export default function ProductsTable({ rows, sort, onSort }) {
  const tableWrapRef = useRef(null);
  const tableDragging = useDragScroll(tableWrapRef);

  const columns = [
    { key: "rank", label: "#", sortable: false },
    { key: "asset", label: "Pool", sortable: true },
    { key: "exchange", label: "Exchange", sortable: true },
    { key: "productType", label: "Type", sortable: true },
    { key: "duration", label: "Duration", sortable: true },
    { key: "apy", label: "Max APY", sortable: true },
    { key: "apyMin", label: "Min APY", sortable: true },
    { key: "minAmount", label: "Min", sortable: false },
    { key: "note", label: "Note", sortable: false },
    { key: "source", label: "Source", sortable: true },
  ];

  return (
    <>
      <div
        className={`table-wrap table-desktop${tableDragging ? " is-dragging" : ""}`}
        ref={tableWrapRef}
      >
        <table className="products-table">
          <colgroup>
            <col className="col-rank" />
            <col className="col-pool" />
            <col className="col-exchange" />
            <col className="col-type" />
            <col className="col-duration" />
            <col className="col-apy" />
            <col className="col-apy-min" />
            <col className="col-min" />
            <col className="col-note" />
            <col className="col-source" />
          </colgroup>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>
                  {col.sortable ? (
                    <button
                      type="button"
                      className="th-btn"
                      onClick={() => onSort(col.key)}
                    >
                      {col.label}
                      <SortIcon active={sort.key === col.key} dir={sort.dir} />
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="empty">
                  No staking products match your filters.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={row.id}>
                  <td className="rank cell-nowrap">{i + 1}</td>
                  <td className="pool-cell">
                    <PoolAsset
                      asset={row.asset}
                      tiered={row.tierDetails?.length > 1}
                    />
                  </td>
                  <td className="exchange-cell cell-nowrap">
                    <ExchangeLink exchange={row.exchange} size="sm" />
                  </td>
                  <td className="cell-nowrap">
                    <div className="type-stack">
                      <TypeBadges row={row} />
                    </div>
                  </td>
                  <td className="duration-cell cell-nowrap">{row.duration}</td>
                  <td className="apy-cell cell-nowrap">{formatApy(row)}</td>
                  <td className="muted cell-nowrap">
                    {row.apyMin != null ? `${row.apyMin.toFixed(2)}%` : "—"}
                  </td>
                  <td className="muted cell-nowrap">{row.minAmount ?? "—"}</td>
                  <td className="note-cell muted">
                    <NoteCell row={row} />
                  </td>
                  <td className="source-cell cell-nowrap">
                    <SourceTags row={row} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-list">
        {rows.length === 0 ? (
          <div className="mobile-empty">No staking products match your filters.</div>
        ) : (
          rows.map((row, i) => (
            <article key={row.id} className="product-card">
              <div className="card-top">
                <div className="card-pool">
                  <span className="card-rank">{i + 1}</span>
                  <PoolAsset
                    asset={row.asset}
                    tiered={row.tierDetails?.length > 1}
                  />
                </div>
                <div className="card-exchange">
                  <ExchangeLink exchange={row.exchange} size="sm" />
                </div>
                <div className="card-apy">{formatApy(row, { showMin: false })}</div>
              </div>
              <div className="card-row">
                <span className="card-label">Type</span>
                <TypeBadges row={row} />
                <span className="card-duration">{row.duration}</span>
              </div>
              <div className="card-row">
                <span className="card-label">Min APY</span>
                <span className="muted">
                  {row.apyMin != null ? `${row.apyMin.toFixed(2)}%` : "—"}
                </span>
                <span className="card-label spaced">Source</span>
                <SourceTags row={row} />
              </div>
              {(row.note || row.announcementUrl || row.restricted) && (
                <div className="card-note muted">
                  <NoteCell row={row} />
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </>
  );
}
