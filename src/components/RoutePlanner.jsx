import { useMemo, useState } from "react";
import { ExchangeLink } from "./ExchangeBrand";
import { buildOptimalRoute, formatCurrency, formatPercent } from "../lib/routeOptimizer";
import { formatDateTime } from "../lib/format";
import "./ExchangeBrand.css";
import "./RoutePlanner.css";

const HORIZON_OPTIONS = [7, 30, 60, 90];

function TypePill({ type }) {
  return <span className={`route-type ${type || "flexible"}`}>{type || "earn"}</span>;
}

function getEligibilityText(product) {
  if (product.eligibility?.summary) return product.eligibility.summary;
  const requirements = Array.isArray(product.eligibility?.requirements)
    ? product.eligibility.requirements
    : [];
  if (requirements.length) return `Eligibility: ${requirements.join("; ")}`;
  return product.restricted ? "Restricted eligibility." : "";
}

function RestrictedPill({ product }) {
  const text = getEligibilityText(product);
  if (!text) return null;
  return (
    <span className="route-type restricted" title={text}>
      Restricted
    </span>
  );
}

function ProductSourceLink({ product }) {
  const href = product.announcementUrl || product.sourceUrl;
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="route-source">
      Source
    </a>
  );
}

function RouteStep({ step, index }) {
  const { product } = step;
  return (
    <li className="route-step">
      <div className="route-step-index">{index + 1}</div>
      <div className="route-step-main">
        <div className="route-step-title">
          <span>
            Day {step.dayStart} - {step.dayEnd}
          </span>
          <TypePill type={product.productType} />
          <RestrictedPill product={product} />
        </div>
        <div className="route-step-exchange">
          <ExchangeLink exchange={product.exchange} size="sm" />
          <span className="route-asset">{product.asset}</span>
          <span className="route-duration">{product.duration}</span>
        </div>
        {step.transferFrom && (
          <p className="route-transfer">
            Move from {step.transferFrom} to {product.exchange}
          </p>
        )}
        {[product.note, getEligibilityText(product)].filter(Boolean).length > 0 && (
          <p className="route-note">
            {[product.note, getEligibilityText(product)].filter(Boolean).join(" | ")}
          </p>
        )}
      </div>
      <div className="route-step-values">
        <strong>{formatCurrency(step.amount, 0)}</strong>
        <span>{formatPercent(step.annualizedApy)}</span>
        <em>+{formatCurrency(step.expectedProfit)}</em>
      </div>
      <ProductSourceLink product={product} />
    </li>
  );
}

function AlternativeRow({ item }) {
  return (
    <li className="alternative-row">
      <ExchangeLink exchange={item.product.exchange} size="sm" />
      <span className="route-asset">{item.product.asset}</span>
      <span>{item.product.duration}</span>
      <strong>{formatPercent(item.annualizedApy)}</strong>
      <em>+{formatCurrency(item.expectedProfit)}</em>
    </li>
  );
}

export default function RoutePlanner({ products, stableCoins, meta }) {
  const [capital, setCapital] = useState("10000");
  const [horizonDays, setHorizonDays] = useState(30);
  const [asset, setAsset] = useState("all");
  const [isNewUser, setIsNewUser] = useState(true);
  const [includePromos, setIncludePromos] = useState(true);
  const [includeVip, setIncludeVip] = useState(false);
  const [includeRestricted, setIncludeRestricted] = useState(false);

  const assetOptions = useMemo(() => {
    const fromProducts = products.map((product) => product.asset).filter(Boolean);
    return [...new Set([...(stableCoins ?? []), ...fromProducts])].sort();
  }, [products, stableCoins]);

  const capitalValue = Number(String(capital).replace(/,/g, ""));
  const plan = useMemo(
    () =>
      buildOptimalRoute(products, {
        capital: capitalValue,
        horizonDays,
        asset,
        isNewUser,
        includePromos,
        includeVip,
        includeRestricted,
      }),
    [
      products,
      capitalValue,
      horizonDays,
      asset,
      isNewUser,
      includePromos,
      includeVip,
      includeRestricted,
    ],
  );

  return (
    <section className="route-planner">
      <div className="route-head">
        <div>
          <span className="route-kicker">AI Route</span>
          <h2>AI Recommended Route</h2>
          {meta?.fetchedAt && (
            <p className="route-updated">Updated: {formatDateTime(meta.fetchedAt)}</p>
          )}
        </div>
      </div>

      <form className="route-form" onSubmit={(event) => event.preventDefault()}>
        <label className="route-field capital">
          <span>Capital</span>
          <input
            type="number"
            min="1"
            step="100"
            inputMode="decimal"
            value={capital}
            onChange={(event) => setCapital(event.target.value)}
          />
        </label>

        <div className="route-field">
          <span>Period</span>
          <div className="route-segmented">
            {HORIZON_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                className={horizonDays === days ? "active" : ""}
                onClick={() => setHorizonDays(days)}
              >
                {days}D
              </button>
            ))}
          </div>
        </div>

        <div className="route-field">
          <span>Status</span>
          <div className="route-segmented">
            <button
              type="button"
              className={isNewUser ? "active" : ""}
              onClick={() => setIsNewUser(true)}
            >
              New user
            </button>
            <button
              type="button"
              className={!isNewUser ? "active" : ""}
              onClick={() => setIsNewUser(false)}
            >
              Existing user
            </button>
          </div>
        </div>

        <label className="route-field">
          <span>Coin</span>
          <select value={asset} onChange={(event) => setAsset(event.target.value)}>
            <option value="all">All</option>
            {assetOptions.map((coin) => (
              <option key={coin} value={coin}>
                {coin}
              </option>
            ))}
          </select>
        </label>

        <label className="route-check">
          <input
            type="checkbox"
            checked={includePromos}
            onChange={(event) => setIncludePromos(event.target.checked)}
          />
          <span>Include promos</span>
        </label>

        <label className="route-check">
          <input
            type="checkbox"
            checked={includeVip}
            onChange={(event) => setIncludeVip(event.target.checked)}
          />
          <span>Include VIP</span>
        </label>

        <label className="route-check">
          <input
            type="checkbox"
            checked={includeRestricted}
            onChange={(event) => setIncludeRestricted(event.target.checked)}
          />
          <span>Include restricted</span>
        </label>
      </form>

      {plan.summary ? (
        <>
          <div className="route-summary">
            <div className="route-stat">
              <span>Est. profit</span>
              <strong>{formatCurrency(plan.summary.expectedProfit)}</strong>
            </div>
            <div className="route-stat highlight">
              <span>Final amount</span>
              <strong>{formatCurrency(plan.summary.finalAmount)}</strong>
            </div>
            <div className="route-stat">
              <span>Effective APY</span>
              <strong>{formatPercent(plan.summary.effectiveApy)}</strong>
            </div>
            <div className="route-stat">
              <span>Products</span>
              <strong>{plan.eligibleCount}</strong>
            </div>
          </div>

          <div className="route-paths">
            {plan.routes.map((route, routeIndex) => (
              <article key={`${route.initialAmount}-${routeIndex}`} className="route-path">
                <div className="route-path-head">
                  <div>
                    <span>Initial allocation</span>
                    <strong>{formatCurrency(route.initialAmount, 0)}</strong>
                  </div>
                  <div>
                    <span>Est. profit</span>
                    <strong>+{formatCurrency(route.totalProfit)}</strong>
                  </div>
                </div>
                <ol className="route-steps">
                  {route.steps.map((step, index) => (
                    <RouteStep key={step.id} step={step} index={index} />
                  ))}
                </ol>
              </article>
            ))}
          </div>

          {plan.alternatives.length > 0 && (
            <section className="route-alternatives">
              <div className="route-section-title">
                <span>Alternatives</span>
                <strong>{asset === "all" ? "All" : asset}</strong>
              </div>
              <ul>
                {plan.alternatives.map((item) => (
                  <AlternativeRow key={item.product.id} item={item} />
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <div className="route-empty">{plan.warnings[0]}</div>
      )}

      <div className="route-notes">
        {plan.warnings.map((warning) => (
          <span key={warning}>{warning}</span>
        ))}
      </div>
    </section>
  );
}
