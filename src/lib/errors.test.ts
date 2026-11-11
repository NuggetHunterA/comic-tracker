import { describe, expect, it } from "vitest";
import { explain, Hinweis } from "./errors";

describe("explain", () => {
  it("names a lost connection", () => {
    expect(explain({ message: "TypeError: Failed to fetch" })).toMatch(/Keine Verbindung/);
    expect(explain("TypeError: Load failed")).toMatch(/Keine Verbindung/);
  });
  it("names an expired login", () => {
    expect(explain({ message: "JWT expired", code: "PGRST301" })).toMatch(/Anmeldung/);
    expect(explain({ message: "x", context: { status: 401 } })).toMatch(/Anmeldung/);
  });
  it("names a busy or broken server", () => {
    expect(explain({ message: "x", context: { status: 429 } })).toMatch(/Zu viele/);
    expect(explain({ message: "Edge Function returned a non-2xx status code", context: { status: 500 } })).toMatch(/Server/);
    expect(explain({ message: "canceling statement due to statement timeout", code: "57014" })).toMatch(/Server/);
  });
  it("keeps messages meant for the screen", () => {
    expect(explain(new Hinweis("Das ist kein Serien-Link von DC Universe Infinite."))).toBe("Das ist kein Serien-Link von DC Universe Infinite.");
  });
  it("never shows English", () => {
    expect(explain(new Error("duplicate key value violates unique constraint"))).toBe("Das hat nicht geklappt. Versuch es nochmal.");
  });
});
