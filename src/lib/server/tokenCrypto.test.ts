import { describe, expect, it } from "vite-plus/test";
import { openToken, sealToken } from "./tokenCrypto";

const SECRET = "test-session-secret-please-rotate";

describe("tokenCrypto", () => {
  it("round-trips a token", async () => {
    const token = "c2-personal-token-abc123";
    const sealed = await sealToken(SECRET, token);
    expect(sealed).not.toContain(token); // ciphertext, not plaintext
    expect(await openToken(SECRET, sealed)).toBe(token);
  });

  it("produces a different blob each time (random IV)", async () => {
    const a = await sealToken(SECRET, "same");
    const b = await sealToken(SECRET, "same");
    expect(a).not.toBe(b);
    expect(await openToken(SECRET, a)).toBe("same");
    expect(await openToken(SECRET, b)).toBe("same");
  });

  it("returns null when opened with the wrong key", async () => {
    const sealed = await sealToken(SECRET, "secret-token");
    expect(await openToken("a-different-secret", sealed)).toBeNull();
  });

  it("returns null for a tampered blob", async () => {
    const sealed = await sealToken(SECRET, "secret-token");
    // Flip a leading char (part of the IV) so a real byte changes; GCM then
    // fails to decrypt. (The trailing char can carry unused low bits.)
    const first = sealed[0] === "A" ? "B" : "A";
    const tampered = first + sealed.slice(1);
    expect(await openToken(SECRET, tampered)).toBeNull();
  });

  it("returns null for garbage input", async () => {
    expect(await openToken(SECRET, "not-a-real-blob")).toBeNull();
    expect(await openToken(SECRET, "")).toBeNull();
  });
});
