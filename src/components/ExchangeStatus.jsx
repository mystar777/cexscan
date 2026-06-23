import HorizontalCarousel from "./HorizontalCarousel";
import { ExchangeLink } from "./ExchangeBrand";
import "./ExchangeBrand.css";
import "./ExchangeStatus.css";

function SourceBadge({ sources }) {
  if (!sources?.length) return <span className="ex-pending">Pending</span>;
  return (
    <span className="ex-sources">
      {sources.includes("api") && <span className="src-badge api">API</span>}
      {sources.includes("site") && <span className="src-badge site">Site</span>}
      {sources.includes("announcement") && (
        <span className="src-badge ann">Notice</span>
      )}
    </span>
  );
}

export default function ExchangeStatus({ status, exchanges }) {
  const statusMap = Object.fromEntries(status.map((s) => [s.exchange, s]));

  const allCards = [
    ...exchanges.map((ex) => ({ ...ex, type: "exchange" })),
    ...(statusMap["Gate.io"]?.ok
      ? [{ id: "gate", name: "Gate.io", rank: null, color: "#17E6A1", type: "bonus" }]
      : []),
  ];

  return (
    <section className="exchange-status">
      <h2 className="section-title">Exchange status</h2>

      <HorizontalCarousel>
        {allCards.map((ex) => {
          const s = statusMap[ex.name] ?? {
            ok: false,
            count: 0,
            sources: [],
            apiCount: 0,
            announcementCount: 0,
          };
          return (
            <div
              key={ex.id}
              className={`exchange-card ${s.ok ? "ok" : "pending"}`}
            >
              <div className="ex-header">
                <ExchangeLink exchange={ex.name} size="md" />
                {ex.rank != null && <span className="ex-rank">#{ex.rank}</span>}
              </div>
              <div className="ex-body">
                {s.ok ? (
                  <>
                    <span className="ex-count">{s.count} pools</span>
                    <SourceBadge sources={s.sources} />
                  </>
                ) : (
                  <SourceBadge sources={s.sources} />
                )}
              </div>
            </div>
          );
        })}
      </HorizontalCarousel>
    </section>
  );
}
