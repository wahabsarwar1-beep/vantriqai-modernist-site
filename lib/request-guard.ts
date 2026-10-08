import { isIP } from 'node:net';

type Bucket = { hits: number; until: number };
const buckets = new Map<string, Bucket>();

// This complements edge limits. Hosting must overwrite forwarded client IPs.
export function limitPublicRequest(request: Request, namespace: string, max: number, globalMax: number): Response | null {
  const raw = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '';
  const ip = isIP(raw) ? raw : 'unknown';
  const now = Date.now();
  for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key);
  const keys = [namespace + ':global', namespace + ':' + ip];
  for (let i = 0; i < keys.length; i++) {
    const value = buckets.get(keys[i]) || { hits: 0, until: now + 60000 };
    value.hits++;
    if ((!buckets.has(keys[i]) && buckets.size >= 10000) || value.hits > (i ? max : globalMax)) {
      return Response.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429, headers: { 'Retry-After': '60' } });
    }
    buckets.set(keys[i], value);
  }
  return null;
}

export async function readBoundedBody(request: Request, maxBytes: number): Promise<string> {
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > maxBytes) throw new Error('Payload too large');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new Error('Payload too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(joined);
}
