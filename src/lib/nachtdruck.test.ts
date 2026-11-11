import { describe, expect, it } from "vitest";
import { eveningOf, isNight, nextSwitch } from "./nachtdruck";

const at = (d: string) => new Date(d);

describe("Nachtdruck clock", () => {
  it("is night from 21:00 to 05:59", () => {
    expect(isNight(at("2026-11-11T20:59:00"))).toBe(false);
    expect(isNight(at("2026-11-11T21:00:00"))).toBe(true);
    expect(isNight(at("2026-11-12T05:59:00"))).toBe(true);
    expect(isNight(at("2026-11-12T06:00:00"))).toBe(false);
  });

  it("counts the small hours to the evening before", () => {
    expect(eveningOf(at("2026-11-11T21:30:00"))).toBe("2026-11-11");
    expect(eveningOf(at("2026-11-12T01:30:00"))).toBe("2026-11-11");
    expect(eveningOf(at("2026-12-01T02:00:00"))).toBe("2026-11-30");
  });

  it("finds the next switch", () => {
    expect(nextSwitch(at("2026-11-11T12:18:00")).toString()).toBe(at("2026-11-11T21:00:00").toString());
    expect(nextSwitch(at("2026-11-11T22:00:00")).toString()).toBe(at("2026-11-12T06:00:00").toString());
    expect(nextSwitch(at("2026-11-12T03:00:00")).toString()).toBe(at("2026-11-12T06:00:00").toString());
  });
});
