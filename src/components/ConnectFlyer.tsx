import type { Connect } from "../lib/types";
import { shortDate } from "../lib/dates";

/**
 * DC's monthly catalog, taped above the DC catalog. Unread it is a flyer with the way into
 * Infinite; once read it folds down to one line that names the next one.
 */
export function ConnectFlyer({ latest, next, href, onRead }: {
  latest: Connect;
  /** The next catalog, once DC has dated it. */
  next?: { number: number; store_date: string | null };
  href: string;
  onRead: () => void;
}) {
  const target = href.startsWith("intent:") ? undefined : "_blank";
  if (latest.read_on) {
    return (
      <p className="connect-line">
        <span><b>DC Connect #{latest.number}</b> gelesen</span>
        <span className="d">{next?.store_date ? `#${next.number} AB ${shortDate(next.store_date)}` : `#${latest.number + 1} ANFANG NÄCHSTEN MONAT`}</span>
      </p>
    );
  }
  return (
    <section className="connect" aria-label={`DC Connect ${latest.number}`}>
      <span className="tape l" />
      <span className="tape r" />
      <span className={`cv ${latest.cover_url ? "img" : ""}`} style={{ backgroundImage: latest.cover_url ? `url("${latest.cover_url}")` : undefined }} aria-hidden="true" />
      <div className="connect-txt">
        <span className="stk">NEU{latest.store_date ? ` · ${shortDate(latest.store_date)}` : ""}</span>
        <h2>DC Connect <span className="no">#{latest.number}</span></h2>
        <span className="mut">Der Monatskatalog, lesbar auf Infinite.</span>
      </div>
      <div className="connect-act">
        <a className="btn hot" href={href} target={target} rel="noreferrer">In Infinite öffnen</a>
        <button type="button" className="btn" onClick={onRead}>Gelesen</button>
      </div>
    </section>
  );
}
