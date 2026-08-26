import { describe, expect, it, vi } from "vitest";
// @ts-expect-error Electron main-process utilities intentionally remain plain ESM.
import { hydrateSecretPlaceholders, secretPreview } from "../../../../host/desktop-electron/secret-utils.mjs";

describe("Electron secret handling", () => {
  it("shows only the first eight and last four characters of a normal API key", () => {
    expect(secretPreview("sk-1234567890abcdef")).toBe("sk-12345…cdef");
  });

  it("hydrates every placeholder from the current secret value", async () => {
    const readSecret = vi.fn().mockResolvedValueOnce("old-key").mockResolvedValueOnce("new-key");

    await expect(hydrateSecretPlaceholders("Bearer <<provider_API_KEY>>", readSecret))
      .resolves.toBe("Bearer old-key");
    await expect(hydrateSecretPlaceholders("Bearer <<provider_API_KEY>>", readSecret))
      .resolves.toBe("Bearer new-key");
    expect(readSecret).toHaveBeenCalledTimes(2);
  });

  it("reports a missing secret instead of forwarding the placeholder", async () => {
    await expect(hydrateSecretPlaceholders("<<missing>>", async () => null))
      .rejects.toThrow("Missing secret: missing");
  });
});
