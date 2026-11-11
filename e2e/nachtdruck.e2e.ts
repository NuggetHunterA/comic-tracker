import { expect, test } from "@playwright/test";
import { fakeSupabase } from "./fake-supabase";

// Nachtdruck: from 21:00 the app prints in negative. The first opening of the
// evening plays the copier pass; a later opening starts dark straight away.

test("after 21:00 the app turns to the night print, and stays there on reload", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`${e.message}\n${e.stack}`));
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));

  await page.clock.install({ time: new Date("2026-11-11T21:05:00") });
  await fakeSupabase(page);
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-print", "nacht");
  await expect(page.locator(".nd-lamp")).toHaveCount(0, { timeout: 5000 });

  await page.reload();
  // Set before the first render, so the day print never flashes.
  expect(await page.evaluate(() => document.documentElement.dataset.print)).toBe("nacht");
  expect(problems).toEqual([]);
});

test("in the daytime the app keeps the day print", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-11T12:00:00") });
  await fakeSupabase(page);
  await page.goto("/");
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-print", "nacht");
});
