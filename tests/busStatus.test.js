import { describe, expect, it } from "vitest";
import { predictedOffsetMinutes, scheduleStatus } from "../src/utils/busStatus";

describe("predictedOffsetMinutes", () => {
  it("rounds the predicted delay to the minute", () => {
    expect(predictedOffsetMinutes({ delay: 420 })).toBe(7);
    expect(predictedOffsetMinutes({ delay: 89 })).toBe(1);
    expect(predictedOffsetMinutes({ delay: -150 })).toBe(-2);
    expect(predictedOffsetMinutes({ delay: 0 })).toBe(0);
  });

  it("is null when there's no prediction", () => {
    expect(predictedOffsetMinutes({ delay: null })).toBeNull();
    expect(predictedOffsetMinutes({})).toBeNull();
    expect(predictedOffsetMinutes(null)).toBeNull();
    expect(predictedOffsetMinutes({ delay: Number.NaN })).toBeNull();
  });

  it("gives the status chips' colours", () => {
    expect(scheduleStatus(predictedOffsetMinutes({ delay: 420 })).color).toBe("warning");
    expect(scheduleStatus(predictedOffsetMinutes({ delay: 60 })).color).toBe("success");
    expect(scheduleStatus(predictedOffsetMinutes({ delay: -180 })).color).toBe("info");
  });
});
