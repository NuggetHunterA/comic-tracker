import { FORMAT_LABEL } from "../lib/labels";
import type { Format } from "../lib/types";

export function FormatChips({ value, onChange, allowInfinite = true }: { value: Format; onChange: (f: Format) => void; allowInfinite?: boolean }) {
  const formats: Format[] = allowInfinite ? ["infinite", "print", "digital"] : ["print", "digital"];
  return (
    <div className="joined" role="radiogroup" aria-label="Format">
      {formats.map((f) => (
        <button key={f} type="button" role="radio" aria-checked={value === f} className={`chip ${value === f ? "on" : ""}`} onClick={() => onChange(f)}>
          {f === "digital" ? "Digital gekauft" : FORMAT_LABEL[f]}
        </button>
      ))}
    </div>
  );
}
