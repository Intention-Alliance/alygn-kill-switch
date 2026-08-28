/**
 * Node-style HTTP response adapter for the Bun.serve() fetch handler.
 *
 * The kill-switch handler chain (createHandler in index.ts) speaks the
 * Node `ServerResponse`-ish contract: setHeader / writeHead / write / end.
 * Bun's fetch handler resolves a single `Response` instead, so this adapter
 * buffers everything written to it and resolves the Response at `end()`.
 *
 * NOTE: this is a BUFFERED pass-through — `write()` accumulates into `_b`
 * and the full body is materialized at `end()`. It is NOT incremental
 * streaming; SSE/chunked upstream bodies are relayed as one assembled body.
 *
 * P1-3: the buffer is CAPPED at MAX_BUFFER_BYTES. Exceeding the cap aborts
 * the response with 502 + `{ error: 'response_too_large' }` so a runaway
 * generation cannot OOM the kill-switch.
 *
 * P2-5: a single persistent TextDecoder is reused across write() calls so
 * multi-byte UTF-8 sequences split across chunk boundaries decode
 * correctly (a fresh decoder per chunk would corrupt them).
 */

// P2-5: a persistent TextDecoder is reused across write() calls so multi-byte
// UTF-8 sequences split across chunk boundaries decode correctly (a fresh
// decoder per chunk would corrupt them). The decoder is created PER ADAPTER
// (inside createNodeResAdapter) so concurrent responses never interleave
// decode state.

export const MAX_BUFFER_BYTES = 64 * 1024 * 1024; // 64 MiB — see docs below

export interface NodeResAdapter {
  _h: Record<string, string>;
  _s: number;
  _b: string;
  _bytes: number;
  _aborted: boolean;
  setHeader(name: string, value: string): void;
  writeHead(status: number, headers?: Record<string, string>): void;
  write(chunk: string | Uint8Array): void;
  end(data?: string): void;
}

/**
 * Create a node-style response adapter that resolves a single `Response`
 * when `end()` is called.
 *
 * @param resolve called exactly once, with the fully-buffered Response.
 */
export function createNodeResAdapter(resolve: (response: Response) => void): NodeResAdapter {
  // Per-adapter decoder (P2-5) — keeps streaming decode state across
  // write() calls for THIS response only.
  const decoder = new TextDecoder();
  const adapter: NodeResAdapter = {
    _h: {},
    _s: 200,
    _b: '',
    _bytes: 0,
    _aborted: false,
    setHeader(name: string, value: string) {
      this._h[name.toLowerCase()] = String(value);
    },
    writeHead(status: number, headers?: Record<string, string>) {
      this._s = status;
      if (headers) {
        for (const [name, value] of Object.entries(headers)) {
          this._h[name.toLowerCase()] = String(value);
        }
      }
    },
    write(chunk: string | Uint8Array) {
      if (this._aborted) return;
      const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      const bytes = Buffer.byteLength(text);
      if (this._bytes + bytes > MAX_BUFFER_BYTES) {
        // P1-3: cap exceeded — abort with 502 + response_too_large so a
        // runaway generation cannot OOM the kill-switch. The proxy route
        // checks _aborted after the relay loop and stops reading upstream.
        this._aborted = true;
        this._s = 502;
        this._h['content-type'] = 'application/json';
        this._b = JSON.stringify({ error: 'response_too_large' });
        this._bytes = Buffer.byteLength(this._b);
        return;
      }
      this._b += text;
      this._bytes += bytes;
    },
    end(data?: string) {
      if (this._aborted) {
        // Flush + reset the decoder state so a later end() cannot append
        // garbage and the next response starts clean.
        decoder.decode();
        const headers = new Headers(this._h);
        headers.set('content-length', String(this._bytes));
        resolve(new Response(this._b, { status: this._s, headers }));
        return;
      }
      if (data) {
        const text = typeof data === 'string' ? data : decoder.decode(data, { stream: true });
        const bytes = Buffer.byteLength(text);
        if (this._bytes + bytes > MAX_BUFFER_BYTES) {
          this._aborted = true;
          this._s = 502;
          this._h['content-type'] = 'application/json';
          this._b = JSON.stringify({ error: 'response_too_large' });
          this._bytes = Buffer.byteLength(this._b);
        } else {
          this._b += text;
          this._bytes += bytes;
        }
      }
      // Flush any remaining decoder state (P2-5).
      const tail = decoder.decode();
      if (tail) {
        this._b += tail;
        this._bytes += Buffer.byteLength(tail);
      }
      const headers = new Headers(this._h);
      headers.set('content-length', String(this._bytes));
      resolve(new Response(this._b, { status: this._s, headers }));
    },
  };
  return adapter;
}
