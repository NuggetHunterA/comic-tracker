import { expect, test, type Page } from "@playwright/test";
import { day, fakeSupabase } from "./fake-supabase";

// Ansage: a spoken wish goes to Claude (the ansage edge function, faked here),
// the sheet shows the evenings that would follow, "Übernehmen" puts the issues
// on top and "Rückgängig" puts the list back.

const SHOTS = process.env.ANSAGE_SHOTS;

const SERIES = [
  { id: 1, name: "Absolute Batman", year_began: 2024, publisher: "DC Comics", volume: 1, status: "Ongoing" },
  { id: 2, name: "Ultimate Spider-Man", year_began: 2024, publisher: "Marvel", volume: 3, status: "Ongoing" },
  { id: 5, name: "Absolute Green Arrow", year_began: 2025, publisher: "DC Comics", volume: 1, status: "Ongoing" },
  { id: 6, name: "Detective Comics", year_began: 1937, publisher: "DC Comics", volume: 1, status: "Ongoing" },
  { id: 8, name: "Ultimate X-Men", year_began: 2024, publisher: "Marvel", volume: 1, status: "Ongoing" },
];
const issue = (id: number, series_id: number, n: number, ago: number) =>
  ({ id, series_id, number: String(n), sort_number: n, store_date: day(-ago), cover_url: null, is_annual: false });
const ISSUES = [
  ...[1, 2, 3].map((n) => issue(600 + n, 6, 1090 + n, 300 - n)),
  ...[4, 5, 6].map((n) => issue(100 + n, 1, n, 200 - n * 20)),
  ...[1, 2, 3, 4].map((n) => issue(500 + n, 5, n, 120 - n * 20)),
  ...[7, 8].map((n) => issue(200 + n, 2, n, 120 - n * 10)),
  ...[3, 4].map((n) => issue(800 + n, 8, n, 110 - n * 10)),
];
const row = (i: { id: number; series_id: number }) => ({
  issue_id: i.id, status: "pile", format: "print", old_pile: i.series_id === 6, bought_on: day(-5), read_on: null, rating: null, skip_plan: false,
});
const GREEN_ARROW = [501, 502, 503, 504];

async function setup(page: Page, answer: { reply: string; issueIds: number[] }) {
  await fakeSupabase(page, { series: SERIES, issues: ISSUES, user_issues: ISSUES.map(row), followed_series: [] });
  await page.route("**/functions/v1/ansage", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    await new Promise((r) => setTimeout(r, 900));
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(answer) });
  });
  // The browser's recognizer, replaced by one that "hears" the words one by one.
  // After "Absolute" it stops by itself, as Chrome does after a pause; the app
  // has to start it again and keep the words.
  await page.addInitScript(() => {
    const rounds = ["Ich will alle Absolute", "Green Arrow als Nächstes lesen"].map((r) => r.split(" "));
    let n = 0;
    class FakeRecognition {
      lang = ""; interimResults = false; continuous = false;
      onresult: ((e: unknown) => void) | null = null; onerror: ((e: unknown) => void) | null = null; onend: (() => void) | null = null;
      timers: number[] = [];
      start() {
        const words = rounds[Math.min(n++, rounds.length - 1)];
        const last = n === rounds.length;
        words.forEach((_, k) => this.timers.push(window.setTimeout(() => {
          const t = words.slice(0, k + 1).join(" ");
          this.onresult?.({ results: [Object.assign([{ transcript: t }], { isFinal: false })] });
        }, 150 * (k + 1))));
        // The pause: the first round ends without "Fertig".
        if (!last) this.timers.push(window.setTimeout(() => this.onend?.(), 150 * words.length + 400));
      }
      stop() { this.timers.forEach(clearTimeout); this.onend?.(); }
      abort() { this.timers.forEach(clearTimeout); this.onend?.(); }
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
  });
}

const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` });
};

test("say a wish, see the evenings, take it over, take it back", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`${e.message}\n${e.stack}`));
  await setup(page, { reply: "Alle vier Absolute Green Arrow liegen jetzt oben, #1 bis #4. Heute Abend die ersten drei, morgen #4.", issueIds: GREEN_ARROW });

  await page.goto("/#stapel");
  await page.getByRole("button", { name: "Reihenfolge" }).click();
  await shot(page, "1-stapel");

  await page.getByRole("button", { name: "Ansage" }).click();
  await expect(page).toHaveURL(/#stapel\/ansage$/);
  await shot(page, "2-bereit");

  await page.getByRole("button", { name: "Sprechen" }).click();
  // A pause after "Absolute" does not send the wish: it keeps listening.
  await page.waitForTimeout(1000);
  await expect(page.getByRole("button", { name: "Fertig" })).toBeVisible();
  await expect(page.getByText("Ich will alle Absolute Green")).toBeVisible();
  await shot(page, "3-hoert");
  await expect(page.getByText(/als Nächstes lesen/)).toBeVisible();
  await page.getByRole("button", { name: "Fertig" }).click();

  await expect(page.getByRole("status").filter({ hasText: "CLAUDE SUCHT IM STAPEL" })).toBeVisible();
  await page.waitForTimeout(150);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-4-sucht.png` });

  await expect(page.getByText(/Alle vier Absolute Green Arrow liegen jetzt oben/)).toBeVisible();
  const preview = page.getByRole("list", { name: "Die nächsten Abende danach" });
  await expect(preview.getByText("Absolute Green Arrow #1, nach oben gelegt")).toBeVisible();
  await shot(page, "5-vorschau");

  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(page).toHaveURL(/#stapel$/);
  await expect(page.getByText("4 Hefte nach oben gelegt")).toBeVisible();
  await shot(page, "6-uebernommen");

  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByText("4 Hefte nach oben gelegt")).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("nothing on the pile fits: Claude says so, nothing to take over", async ({ page }) => {
  await setup(page, { reply: "Auf deinem Stapel liegt kein Hellblazer. Folg der Serie unter Meine Serien, dann kann ich sie nach oben legen.", issueIds: [] });
  await page.goto("/#stapel/ansage");
  await page.getByRole("button", { name: "Lieber tippen" }).click();
  await page.getByLabel("Dein Wunsch").fill("Heute nur Hellblazer");
  await page.getByRole("button", { name: "Los" }).click();
  await expect(page.getByText(/kein Hellblazer/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Übernehmen" })).toHaveCount(0);
  await shot(page, "7-nichts");
});
