import { describe, expect, it } from "vitest";
import { pullUp } from "./ansage";

const e = (issueId: number, manual = false) => ({ issueId, manual, added: false });

describe("pullUp", () => {
  it("puts the issues on top in Claude's order, moved by hand, and keeps the rest", () => {
    expect(pullUp([e(1), e(2, true), e(3), e(4)], [4, 3])).toEqual([e(4, true), e(3, true), e(1), e(2, true)]);
  });
  it("ignores ids that are not on the list and doubles", () => {
    expect(pullUp([e(1), e(2)], [9, 2, 2])).toEqual([e(2, true), e(1)]);
  });
});
