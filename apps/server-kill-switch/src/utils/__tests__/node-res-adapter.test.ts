/**
 * Node-Response Adapter — Unit Tests (P1-3 cap, P2-5 UTF-8)
 *
 * Covers:
 *   - buffered pass-through contract (write/end → single Response)
 *   - P1-3: MAX_BUFFER_BYTES cap → 502 + response_too_large (no OOM)
 *   - P2-5: persistent TextDecoder — multi-byte UTF-8 split across chunk
 *     boundaries decodes correctly
 */

import { describe, it, expect } from 'bun:test';
import { createNodeResAdapter, MAX_BUFFER_BYTES } from '../node-res-adapter';

function makeAdapter(): { res: ReturnType<typeof createNodeResAdapter>; response: Promise<Response> } {
  let resolveResponse: (r: Response) => void = () => {};
  const response = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });
  return { res: createNodeResAdapter(resolveResponse), response };
}

describe('createNodeResAdapter — buffered pass-through', () => {
  it('resolves a single Response with the full buffered body at end()', async () => {
    const { res, response } = makeAdapter();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"a":');
    res.write('1}');
    res.end();
    const r = await response;
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/json');
    expect(await r.text()).toBe('{"a":1}');
  });

  it('sets content-length from the buffered bytes', async () => {
    const { res, response } = makeAdapter();
    res.write('hello');
    res.end();
    const r = await response;
    expect(r.headers.get('content-length')).toBe('5');
  });

  it('handles end(data) appending to the buffer', async () => {
    const { res, response } = makeAdapter();
    res.write('a');
    res.end('b');
    const r = await response;
    expect(await r.text()).toBe('ab');
  });
});

describe('createNodeResAdapter — P1-3 buffer cap', () => {
  it('aborts with 502 + response_too_large when the cap is exceeded', async () => {
    const { res, response } = makeAdapter();
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    // Write a chunk larger than the cap in one call.
    res.write('x'.repeat(MAX_BUFFER_BYTES + 1));
    expect(res._aborted).toBe(true);
    res.end();
    const r = await response;
    expect(r.status).toBe(502);
    const body = (await r.json()) as { error?: string };
    expect(body.error).toBe('response_too_large');
  });

  it('aborts when the ACCUMULATED buffer exceeds the cap across chunks', async () => {
    const { res, response } = makeAdapter();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // Half the cap twice — the second write crosses the limit.
    const half = Math.floor(MAX_BUFFER_BYTES / 2);
    res.write('a'.repeat(half));
    expect(res._aborted).toBe(false);
    res.write('b'.repeat(half + 1));
    expect(res._aborted).toBe(true);
    res.end();
    const r = await response;
    expect(r.status).toBe(502);
  });

  it('does not abort when the buffer stays under the cap', async () => {
    const { res, response } = makeAdapter();
    res.write('small');
    expect(res._aborted).toBe(false);
    res.end();
    const r = await response;
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('small');
  });
});

describe('createNodeResAdapter — P2-5 persistent TextDecoder', () => {
  it('decodes multi-byte UTF-8 split across chunk boundaries', async () => {
    const { res, response } = makeAdapter();
    // "héllo" — é is 2 bytes (0xC3 0xA9). Split the byte sequence mid-é.
    const bytes = new TextEncoder().encode('héllo');
    res.write(bytes.slice(0, 2)); // 'h' + first byte of é
    res.write(bytes.slice(2));    // second byte of é + rest
    res.end();
    const r = await response;
    expect(await r.text()).toBe('héllo');
  });

  it('decodes a 4-byte emoji split across three chunks', async () => {
    const { res, response } = makeAdapter();
    const bytes = new TextEncoder().encode('a😀b'); // 😀 is 4 bytes
    res.write(bytes.slice(0, 1));
    res.write(bytes.slice(1, 3));
    res.write(bytes.slice(3));
    res.end();
    const r = await response;
    expect(await r.text()).toBe('a😀b');
  });
});
