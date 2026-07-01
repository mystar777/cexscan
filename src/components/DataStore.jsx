import { useEffect, useState } from "react";
import "./DataStore.css";

function endpointUrl(path) {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

function CurlBox({ item }) {
  const command = `curl -H "Accept: application/json" ${endpointUrl(item.path)}`;
  return <code className="data-curl">{command}</code>;
}

export default function DataStore() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;

    fetch("/api/x402/catalog")
      .then((res) => {
        if (!res.ok) throw new Error("Catalog API error");
        return res.json();
      })
      .then((payload) => {
        if (alive) setCatalog(payload);
      })
      .catch((err) => {
        if (alive) setError(err.message);
      });

    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return <div className="banner error">Data API catalog failed: {error}</div>;
  }

  if (!catalog) {
    return <div className="loading">Loading data API catalog...</div>;
  }

  return (
    <section className="data-store">
      <header className="data-store-head">
        <div>
          <span className="data-kicker">X402 Data API</span>
          <h2>Paid CEX staking datasets</h2>
          <p>
            Machine-readable exchange staking data sold per request through HTTP
            402 payments.
          </p>
        </div>
        <div className="data-payment">
          <span>Network</span>
          <strong>{catalog.network}</strong>
          <span>Pay to</span>
          <code>{catalog.payTo}</code>
        </div>
      </header>

      <div className="data-products">
        {catalog.products.map((item) => (
          <article className="data-product" key={item.id}>
            <div className="data-product-main">
              <span className="data-price">{item.price}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </div>
            <dl className="data-meta-list">
              <div>
                <dt>Method</dt>
                <dd>{item.method}</dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>{item.mimeType}</dd>
              </div>
              <div>
                <dt>Scheme</dt>
                <dd>{item.scheme}</dd>
              </div>
            </dl>
            <div className="data-fields">
              {item.fields.map((field) => (
                <span key={field}>{field}</span>
              ))}
            </div>
            <div className="data-endpoint">
              <CurlBox item={item} />
              <a href={item.path} target="_blank" rel="noreferrer">
                Open endpoint
              </a>
            </div>
          </article>
        ))}
      </div>

      <footer className="data-notes">
        {catalog.notes.map((note) => (
          <span key={note}>{note}</span>
        ))}
      </footer>
    </section>
  );
}
