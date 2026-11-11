export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/** Parsed JSON body, or undefined when it is missing, malformed or over 10 KB. */
export async function readJson(req: Request): Promise<unknown> {
  const body = await req.text();
  if (body.length > 10_000) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}
