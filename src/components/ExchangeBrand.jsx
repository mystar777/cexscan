import { getExchangeMeta } from "../lib/exchanges";
import "./ExchangeBrand.css";

export function ExchangeIcon({ exchange, size = "md" }) {
  const meta = getExchangeMeta(exchange);
  return (
    <img
      src={meta.icon}
      alt=""
      className={`exchange-icon exchange-icon-${size}`}
      loading="lazy"
      draggable={false}
    />
  );
}

export function ExchangeLink({ exchange, size = "md" }) {
  const meta = getExchangeMeta(exchange);
  const className = `exchange-link exchange-link-${size}`;

  const inner = (
    <>
      <ExchangeIcon exchange={exchange} size={size} />
      <span className="exchange-link-name">{exchange}</span>
    </>
  );

  if (meta.referralUrl) {
    return (
      <a
        href={`/api/out/${encodeURIComponent(meta.id)}`}
        className={className}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open ${exchange} (referral)`}
      >
        {inner}
      </a>
    );
  }

  return <span className={className}>{inner}</span>;
}

export function PoolHeader({ asset, exchange }) {
  return (
    <div className="pool-header">
      <div className="pool-asset">
        <span className="asset-badge">{asset}</span>
      </div>
      <ExchangeLink exchange={exchange} size="lg" />
    </div>
  );
}
