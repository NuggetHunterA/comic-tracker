import { expect, test } from "@playwright/test";
import { fakeSupabase } from "./fake-supabase";

// Smoke test: the app starts, every tab opens, an issue opens and the
// back button and deep links go where the URL says.

test.beforeEach(async ({ page }) => {
  await fakeSupabase(page);
});

test("start, tabs, detail, back button and deep link", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`${e.message}\n${e.stack}`));
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));

  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  await expect(nav.getByRole("link", { name: /Plan/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("alert")).toHaveCount(0);

  // Every tab opens and shows its heading.
  for (const tab of ["Stapel", "Katalog", "Serien", "Plan"]) {
    await nav.getByRole("link", { name: new RegExp(tab) }).click();
    await expect(page).toHaveURL(new RegExp(`#${tab.toLowerCase()}$`));
    await expect(nav.getByRole("link", { name: new RegExp(tab) })).toHaveAttribute("aria-current", "page");
  }

  // An issue on the pile opens in the detail, and the URL says which.
  await nav.getByRole("link", { name: /Stapel/ }).click();
  await page.locator("main").getByRole("button", { name: /Absolute Batman/ }).first().click();
  await expect(page).toHaveURL(/#stapel\/(heft|serie)\/\d+/);
  const detail = page.getByLabel("Stapel im Detail");
  await expect(detail).toBeVisible();
  const opened = page.url();

  // The back button closes it again.
  await page.goBack();
  await expect(page).toHaveURL(/#stapel$/);
  await expect(page.getByRole("dialog", { name: "Stapel im Detail" })).toHaveCount(0);

  // Forward and a deep link bring it back.
  await page.goForward();
  await expect(page).toHaveURL(opened);
  await page.goto("/#plan/heft/102");
  await expect(page.getByLabel("Heft im Detail")).toContainText("Absolute Batman");
  await page.goto("/#serien/serie/1");
  await expect(page.getByLabel("Serie im Detail")).toContainText("Absolute Batman");

  // Closing the sheet steps back instead of stacking up: back from the list
  // does not open the issue again.
  if (test.info().project.name === "zugeklappt") {
    await page.goto("/#plan");
    await nav.getByRole("link", { name: /Katalog/ }).click();
    await page.locator("main .tile").first().click();
    await expect(page).toHaveURL(/#katalog\/heft\/\d+$/);
    await page.getByRole("dialog", { name: "Heft im Katalog" }).getByRole("button", { name: "Schließen" }).click();
    await expect(page).toHaveURL(/#katalog$/);
    await page.goBack();
    await expect(page).toHaveURL(/#plan$/);
  }

  expect(problems).toEqual([]);
});

test("Archivkiste: blind envelope on the empty evening, flyer in the thin week", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`${e.message}\n${e.stack}`));

  await page.goto("/");
  // Nothing on the pile is readable: tonight gets one blind envelope, the week the flyer.
  await expect(page.getByText("Heute ist nichts lesbar. Dafür ist Post aus dem Archiv da.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Überraschung aus dem Archiv/ })).toHaveCount(1);
  const flyer = page.getByRole("region", { name: "Aus dem Archiv" });
  await expect(flyer.getByRole("button", { name: /^Umschlag aufreißen: \d{4}/ })).toHaveCount(2);

  // Tearing one open shows what is inside and what to do with it.
  await flyer.getByRole("button", { name: /^Umschlag aufreißen: \d{4}/ }).first().click();
  await expect(flyer.getByRole("button", { name: "Auf den Stapel" })).toBeVisible();
  await expect(flyer.getByRole("button", { name: "Zurück in die Kiste" })).toBeVisible();
  expect(problems).toEqual([]);
});
