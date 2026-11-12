import { describe, expect, it } from "vitest";
import { writerDue } from "../../supabase/functions/_shared/writer";

const now = new Date("2026-11-12T19:00:00Z");
const issue = (store_date: string | null, writer_synced_at: string | null, writer: string | null = null) => ({ store_date, writer_synced_at, writer });

describe("writerDue", () => {
  it("never asks again once a writer is known", () => {
    expect(writerDue(issue("2026-12-23", null, "Joshua Williamson"), now)).toBe(false);
  });

  it("asks for issues never looked up", () => {
    expect(writerDue(issue("2026-12-23", null), now)).toBe(true);
    expect(writerDue(issue(null, null), now)).toBe(true);
  });

  it("waits for the release day when the first try came before it", () => {
    expect(writerDue(issue("2026-12-23", "2026-10-30T04:07:28Z"), now)).toBe(false);
    expect(writerDue(issue("2026-11-12", "2026-10-30T04:07:28Z"), now)).toBe(true);
    expect(writerDue(issue("2026-11-04", "2026-10-30T04:07:28Z"), now)).toBe(true);
  });

  it("asks again weekly after release while the writer is missing", () => {
    expect(writerDue(issue("2026-11-04", "2026-11-08T10:00:00Z"), now)).toBe(false);
    expect(writerDue(issue("2026-11-04", "2026-11-05T10:00:00Z"), now)).toBe(true);
    expect(writerDue(issue(null, "2026-11-01T10:00:00Z"), now)).toBe(true);
  });

  it("gives up three months after release", () => {
    expect(writerDue(issue("2026-07-01", "2026-08-01T10:00:00Z"), now)).toBe(false);
  });
});
