import { FORMAT_LABEL } from "../lib/labels";
import type { Format } from "../lib/types";

/** The publisher's subscription (Infinite or Webtoon) or Print. Without a subscription there is nothing to pick. */
export function FormatChips({ value, onChange, sub }: { value: Format; onChange: (f: Format) => void; sub: Format | null }) {
  if (!sub) return null;
  const formats: Format[] = [sub, "print"];
  return (
    <div className="joined" role="radiogroup" aria-label="Format">
      {formats.map((f) => (
        <button key={f} type="button" role="radio" aria-checked={value === f} className={`chip ${value === f ? "on" : ""}`} onClick={() => onChange(f)}>
          {FORMAT_LABEL[f]}
        </button>
      ))}
    </div>
  );
}
