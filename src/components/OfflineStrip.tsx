import { useStore } from "../lib/store";
import { stampLabel } from "../lib/offline";

const Cloud = ({ off }: { off: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true">
    <path d="M7 18h10.5a3.5 3.5 0 0 0 .9-6.9A5.5 5.5 0 0 0 8.2 8.6 4.7 4.7 0 0 0 7 18z" />
    {off ? <path d="M3 3l18 18" /> : <path d="M9.5 13.5l2 2 3.5-4" />}
  </svg>
);

/** The black strip while there is no network, and a light one for a moment when it is back. */
export function OfflineStrip() {
  const { offline, queued, backOnline } = useStore();
  if (offline) {
    return (
      <div className="offline" role="status">
        <Cloud off />
        <span className="s"><b>OFFLINE</b>{offline.at && ` · STAND ${stampLabel(offline.at)}`}</span>
        {queued.length > 0 && <span className="q">{queued.length} WARTET</span>}
      </div>
    );
  }
  if (backOnline !== null) {
    const n = backOnline;
    return (
      <div className="offline back" role="status">
        <Cloud off={false} />
        <span className="s"><b>WIEDER ONLINE</b>{n > 0 && ` · ${n} ${n === 1 ? "ÄNDERUNG" : "ÄNDERUNGEN"} GESPEICHERT`}</span>
      </div>
    );
  }
  return null;
}
