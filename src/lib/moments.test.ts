import { describe, expect, it } from "vitest";
import { receipt } from "./moments";

describe("Feierabend receipt", () => {
  it("counts, averages the grades and names the streak", () => {
    expect(receipt(3, [8, 9, 8], 5)).toBe("3 HEFTE · Ø 8,3 · 5. ABEND IN FOLGE");
  });
  it("leaves out the grade without grades and the streak on a first evening", () => {
    expect(receipt(1, [], 1)).toBe("1 HEFT");
    expect(receipt(2, [7], 0)).toBe("2 HEFTE · Ø 7,0");
  });
});
