/** Preserve Kit 3.0.1 json()'s byte-length header while using native Response.json(). */
export async function withJsonContentLength(response: Response): Promise<Response> {
  if (!response.headers.has("content-length")) {
    const body = await response.clone().arrayBuffer();
    response.headers.set("content-length", String(body.byteLength));
  }
  return response;
}
