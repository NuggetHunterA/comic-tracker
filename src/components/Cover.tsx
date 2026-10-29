import type { CSSProperties, ReactNode } from "react";
import type { Issue } from "../lib/types";

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
}

export function Cover({ issue, readable = true, showNumber = true, tape, big, style, className = "", children }: Props) {
  const bg: CSSProperties = {
    backgroundColor: seriesColor(issue.series_id),
    backgroundImage: issue.cover_url ? `url("${issue.cover_url}")` : undefined,
    ...style,
  };
  return (
    <span className={`cv ${issue.cover_url ? "img" : ""} ${readable ? "" : "copy"} ${big ? "big" : ""} ${className}`} style={bg} aria-hidden="true">
      {tape === true && <span className="tape" />}
      {typeof tape === "string" && <span className="tape label">{tape}</span>}
      {showNumber && <span className="num">{issue.number}</span>}
      {children}
    </span>
  );
}
