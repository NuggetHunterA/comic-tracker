export type Format = "print" | "infinite" | "digital";
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

export interface ArcLink {
  arc_id: number;
  issue_id: number;
  position: number;
}

export interface Settings {
  infinite_delay_days: number;
  max_per_evening: number;
}
