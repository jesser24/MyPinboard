import { describe, it, expect } from "vitest";
import { imageSrc, setImageResolver, isNative } from "../src/native/tauriBackend";
import type { PinItem } from "../src/lib/types";

const img = (content: string): PinItem => ({ id: "1", kind: "image", title: "", content, collectionId: "p", tags: [], pinned: false, favorite: false, capturedAt: 1, hash: "" });
describe("native adapter (pure parts)", () => {
  it("browser preview: image content is used as-is (data URL)", () => { expect(imageSrc(img("data:image/png;base64,AAAA"))).toBe("data:image/png;base64,AAAA"); });
  it("native: resolver maps pbimg: references to asset URLs", () => {
    setImageResolver((i) => (i.content.startsWith("pbimg:") ? `asset://x/${i.content.slice(6)}` : i.content));
    expect(imageSrc(img("pbimg:abc.png"))).toBe("asset://x/abc.png");
  });
  it("is not native outside Tauri", () => { expect(isNative()).toBe(false); });
});
