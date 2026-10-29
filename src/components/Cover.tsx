import type { CSSProperties, ReactNode } from "react";
import type { Issue } from "../lib/types";
import { useMaybeStore } from "../lib/store";
import { eventHex } from "../lib/events";

const FALLBACK = ["#c4402f", "#3a4778", "#2274b5", "#2f5fd0", "#2a2a2a", "#7a3f9a", "#b02e3a", "#2f8a4a"];

export function seriesColor(seriesId: number): string {
  return FALLBACK[seriesId % FALLBACK.length];
}

interface Props {
  issue: Issue;
  /** Expected issues render as a grey photocopy. */
  readable?: boolean;
  showNumber?: boolean;
  tape?: boolean | string;
  big?: boolean;
  style?: CSSProperties;
  className?: string;
  /** Marks that sit on the cover: a stamp, a pinned tag. */
  children?: ReactNode;
  /** False where the event shows some other way, e.g. tonight's band. */
  eventMark?: boolean;
}

export function Cover({ issue, readable = true, showNumber = true, tape, big, style, className = "", children, eventMark = true }: Props) {
  const mark = useMaybeStore()?.eventOf.get(issue.id);
  const bg: CSSProperties = {
    backgroundColor: seriesColor(issue.series_id),
    backgroundImage: issue.cover_url ? `url("${issue.cover_url}")` : undefined,
    ...style,
  };
  return (
    <span className={`cv ${issue.cover_url ? "img" : ""} ${readable ? "" : "copy"} ${big ? "big" : ""} ${className}`} style={bg} aria-hidden="true">
      {mark && eventMark ? (
        // The event's own tape, in its colour, takes the place of the plain one.
        <span className="etape" style={{ background: eventHex(mark.event.color) }}>
          <span className="k">{mark.event.short}</span> <span className="p">{mark.part}/{mark.total}</span>
        </span>
      ) : tape === true && <span className="tape" />}
      {typeof tape === "string" && <span className="tape label">{tape}</span>}
      {showNumber && <span className="num">{issue.number}</span>}
      {children}
    </span>
  );
}
