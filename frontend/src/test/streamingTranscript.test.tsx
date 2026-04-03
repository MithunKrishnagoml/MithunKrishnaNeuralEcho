import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StreamingTranscript } from "@/components/StreamingTranscript";

describe("StreamingTranscript", () => {
  it("renders nothing when empty and no typing indicator", () => {
    const html = renderToStaticMarkup(
      <StreamingTranscript text="" isComplete={false} showTypingIndicator={false} />
    );

    expect(html).toBe("");
  });

  it("renders transcript text when present", () => {
    const html = renderToStaticMarkup(
      <StreamingTranscript text="hello world" isComplete={false} showTypingIndicator={true} />
    );

    expect(html).toContain("hello");
    expect(html).toContain("world");
  });

  it("shows completion indicator when complete", () => {
    const html = renderToStaticMarkup(
      <StreamingTranscript text="done" isComplete={true} showTypingIndicator={false} />
    );

    expect(html).toContain("completion-indicator");
    expect(html).toContain("✓");
  });
});
