import { describe, expect, it } from "vite-plus/test";
import { POST } from "./+server";
import { SESSION_COOKIE, TOKEN_COOKIE } from "$lib/server/session";

type DeletedCookie = { name: string; options: Record<string, unknown> };

function fakeEvent(opts: { url?: string }) {
  const deleted: DeletedCookie[] = [];
  const event = {
    cookies: {
      get: () => "sid-123",
      delete: (name: string, options: Record<string, unknown>) => {
        deleted.push({ name, options });
      },
    },
    locals: { personal: true, user: { id: 42 } },
    platform: { env: {} },
    url: new URL(opts.url ?? "http://localhost/"),
  };
  return { event, deleted };
}

describe("logout", () => {
  it("clears the session and token cookies on http and redirects home", async () => {
    const { event, deleted } = fakeEvent({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST(event as any)).rejects.toMatchObject({ status: 303, location: "/" });
    const session = deleted.find((cookie) => cookie.name === SESSION_COOKIE);
    const token = deleted.find((cookie) => cookie.name === TOKEN_COOKIE);
    expect(session?.options).toEqual({
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    expect(token?.options).toEqual({
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });
  });

  it("marks both cleared cookies secure when the page was served over https", async () => {
    const { event, deleted } = fakeEvent({ url: "https://rowplay.example/auth/logout" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(POST(event as any)).rejects.toMatchObject({ status: 303, location: "/" });
    expect(deleted.map((cookie) => cookie.options.secure)).toEqual([true, true]);
  });
});
