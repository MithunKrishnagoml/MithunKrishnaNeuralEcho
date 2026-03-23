import { describe, expect, it, beforeEach, vi } from "vitest";
import { StreamingErrorHandler } from "@/utils/StreamingErrorHandler";

describe("StreamingErrorHandler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("tracks error stats by type and recent window", () => {
    const handler = new StreamingErrorHandler();

    handler.reportError({
      type: "network",
      code: "N1",
      message: "network issue",
      recoverable: false,
    });

    handler.reportError({
      type: "audio",
      code: "A1",
      message: "audio issue",
      recoverable: true,
    });

    const stats = handler.getErrorStats();
    expect(stats.total).toBe(2);
    expect(stats.byType.network).toBe(1);
    expect(stats.byType.audio).toBe(1);
    expect(stats.recoverable).toBe(1);
    expect(stats.recent).toBe(2);
  });

  it("invokes recovery callback for recoverable errors", async () => {
    const onRecovery = vi.fn();
    const handler = new StreamingErrorHandler({ onRecovery });

    handler.addRecoveryStrategy("network-reconnect", {
      name: "mock-network",
      execute: async () => true,
      maxRetries: 1,
      backoffMs: 0,
    });

    handler.reportError({
      type: "network",
      code: "N2",
      message: "recover me",
      recoverable: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onRecovery).toHaveBeenCalledWith("network-reconnect", true);
  });

  it("becomes unhealthy after repeated recent errors", () => {
    const handler = new StreamingErrorHandler();

    for (let i = 0; i < 6; i++) {
      handler.reportError({
        type: "streaming",
        code: `S${i}`,
        message: "burst failure",
        recoverable: false,
      });
    }

    expect(handler.isHealthy()).toBe(false);
  });
});
