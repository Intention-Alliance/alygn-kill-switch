// Cookie parser utility

export function parseCookies(req: { headers: Record<string, string | undefined> }): Record<string, string> {
  const header = req.headers?.cookie || '';
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) cookies[k] = v.join('=');
  }
  return cookies;
}