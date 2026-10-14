import { describe, expect, it } from "vitest";
import { handOverFile } from "./hand-over-file";

const file = new File(["{}"], "telemark-powtorki-2026-10-14.json", { type: "application/json" });

function outlets(share: (() => Promise<void>) | undefined, shareable = true) {
  const downloaded: string[] = [];
  return {
    downloaded,
    outlets: {
      share,
      canShare: share ? () => shareable : undefined,
      download: (f: File) => {
        downloaded.push(f.name);
      },
    },
  };
}

describe("handing a file to the player", () => {
  it("shares it on a phone that can share files", async () => {
    const o = outlets(() => Promise.resolve());
    expect(await handOverFile(file, "Powtórki", true, o.outlets)).toBe("shared");
    expect(o.downloaded).toEqual([]);
  });

  it("downloads it on a computer, or where files cannot be shared", async () => {
    const shareable = outlets(() => Promise.resolve());
    expect(await handOverFile(file, "Powtórki", false, shareable.outlets)).toBe("downloaded");
    const unshareable = outlets(() => Promise.resolve(), false);
    expect(await handOverFile(file, "Powtórki", true, unshareable.outlets)).toBe("downloaded");
    const none = outlets(undefined);
    expect(await handOverFile(file, "Powtórki", true, none.outlets)).toBe("downloaded");
    expect([...shareable.downloaded, ...unshareable.downloaded, ...none.downloaded]).toHaveLength(3);
  });

  it("does nothing more when the player closes the share sheet, and downloads when sharing fails", async () => {
    const closed = outlets(() => Promise.reject(new DOMException("closed", "AbortError")));
    expect(await handOverFile(file, "Powtórki", true, closed.outlets)).toBe("cancelled");
    expect(closed.downloaded).toEqual([]);
    const failed = outlets(() => Promise.reject(new DOMException("denied", "NotAllowedError")));
    expect(await handOverFile(file, "Powtórki", true, failed.outlets)).toBe("downloaded");
  });
});
