import { describe, expect, it } from "vitest";
import { telHref } from "../src/utils/phone";

describe("telHref", () => {
  it("keeps the digits", () => {
    expect(telHref("780-418-6060")).toBe("tel:7804186060");
  });

  it("dials letters as keypad digits", () => {
    expect(telHref("780-464-RIDE")).toBe("tel:7804647433");
  });

  it("keeps a leading plus", () => {
    expect(telHref("+1 780 418 6060")).toBe("tel:+17804186060");
  });
});
