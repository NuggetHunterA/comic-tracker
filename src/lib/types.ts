export type Format = "print" | "infinite";
export type Status = "wishlist" | "expected" | "pile" | "read" | "dismissed";

export interface Series {
  id: number;
  name: string;
  year_began: number | null;
  publisher: string | null;
  volume: number | null;
  status: string | null;
}

export interface Issue {
  id: number;
  series_id: number;
  number: string;
  sort_number: number | null;
  store_date: string | null;
  cover_url: string | null;
  is_annual: boolean;
}

export interface UserIssue {
  issue_id: number;
  status: Status;
  format: Format | null;
  old_pile: boolean;
  bought_on: string | null;
  read_on: string | null;
  rating: number | null;
  skip_plan: boolean;
}

export interface Followed {
  series_id: number;
  default_format: Format;
  paused: boolean;
  created_at: string;
}

export interface PlanPin {
  issue_id: number;
  evening: string;
  slot: number;
  pinned: boolean;
}

/** A reading order across series, kept by hand. */
export interface EventRow {
  id: number;
  name: string;
  short: string;
  color: string;
  manual_order: boolean;
  created_at: string;
}

export interface EventIssue {
  event_id: number;
  issue_id: number;
  position: number;
}

export interface Settings {
  infinite_delay_days: number;
  max_per_evening: number;
}

/** One monthly DC Connect catalog on Infinite; not a Metron issue, so it lives apart. */
export interface Connect {
  number: number;
  url: string;
  cover_url: string | null;
  store_date: string | null;
  read_on: string | null;
}
