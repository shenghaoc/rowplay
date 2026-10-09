import { describe, expect, it } from "vite-plus/test";
import { withJsonContentLength } from "./jsonResponse";

describe("native JSON response contracts", () => {
  it("preserves the characterized UTF-8 body, length, status and private cache policy", async () => {
    const data = { message: "日本語", value: 12 };
    const response = await withJsonContentLength(
      Response.json(data, { headers: { "cache-control": "private, no-store" } }),
    );
    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers)).toEqual({
      "cache-control": "private, no-store",
      "content-length": "34",
      "content-type": "application/json",
    });
    expect(await response.text()).toBe('{"message":"日本語","value":12}');
  });

  it("retains explicit headers, cookies and status without consuming the original body", async () => {
    const response = await withJsonContentLength(
      Response.json(
        { ok: true },
        {
          status: 201,
          headers: { "content-length": "11", "set-cookie": "preference=dark; Path=/" },
        },
      ),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("content-length")).toBe("11");
    expect(response.headers.get("set-cookie")).toBe("preference=dark; Path=/");
    expect(response.bodyUsed).toBe(false);
    expect(await response.json()).toEqual({ ok: true });
  });
});
