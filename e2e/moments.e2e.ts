import { expect, test } from "@playwright/test";
import { day, fakeSupabase, ISSUES, pile } from "./fake-supabase";

// Lese-Erfolge: reading the last part of an event gathers its covers into a
// seal, then FEIERABEND is stamped on the empty wall with the evening's tally.

const bought = (id: number) => ({ ...pile(id), bought_on: day(-3) });
const read = (id: number, on: string) => ({ ...pile(id), status: "read", read_on: on, rating: 8 });

test("last issue of tonight and of an event: seal, then Feierabend stamp", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`${e.message}\n${e.stack}`));
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));

  await fakeSupabase(page, {
    user_issues: [read(101, day(-2)), read(102, day(-1)), bought(103), ...ISSUES.filter((i) => i.series_id !== 1).map((i) => pile(i.id))],
    events: [{ id: 1, name: "Absolute K.O.", short: "K.O.", color: "gelb", manual_order: false, created_at: day(-30) }],
    event_issues: [101, 102, 103].map((issue_id, k) => ({ event_id: 1, issue_id, position: k + 1 })),
  });
  await page.goto("/");
  const wall = page.getByRole("region", { name: "Heute Abend lesen" });
  await wall.getByRole("button", { name: /als gelesen markieren/ }).click();

  // The covers gather into the seal; a tap skips to the end.
  const finale = page.getByRole("status", { name: "Absolute K.O. durchgelesen" });
  await expect(finale).toBeVisible();
  await finale.click();
  await expect(finale).toHaveCount(0);

  // The seal stays beside the headline, the stamp and the tally on the wall.
  await expect(page.getByRole("img", { name: "Absolute K.O.: 3 von 3 gelesen" })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Feierabend, / })).toBeVisible();
  await expect(page.getByText("1 HEFT · 3. ABEND IN FOLGE")).toBeVisible();

  // The finished event moves to "Abgeschlossen" in Meine Serien.
  await page.goto("/#serien/events");
  await expect(page.getByRole("region", { name: "Abgeschlossen" }).getByRole("button", { name: /Absolute K.O./ })).toBeVisible();
  expect(problems).toEqual([]);
});
