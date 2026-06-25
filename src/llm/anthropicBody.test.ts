import { describe, it, expect } from "vitest";
import { buildMessagesWithImages, concatTextBlocks } from "./anthropicBody";

describe("buildMessagesWithImages", () => {
  it("leaves messages unchanged with no images", () => {
    const msgs = [{ role: "user" as const, content: "hi" }];
    expect(buildMessagesWithImages(msgs)).toEqual(msgs);
  });
  it("attaches image blocks to the last message", () => {
    const out = buildMessagesWithImages([{ role: "user", content: "look" }], ["B64"]);
    const last = out[out.length - 1]!;
    expect(Array.isArray(last.content)).toBe(true);
    expect((last.content as Array<Record<string, unknown>>)[0]).toEqual({ type: "text", text: "look" });
    expect((last.content as Array<Record<string, unknown>>)[1]).toEqual({
      type: "image", source: { type: "base64", media_type: "image/png", data: "B64" },
    });
  });
});

describe("concatTextBlocks", () => {
  it("joins only text blocks", () => {
    expect(concatTextBlocks([{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }])).toBe("ab");
  });
});
