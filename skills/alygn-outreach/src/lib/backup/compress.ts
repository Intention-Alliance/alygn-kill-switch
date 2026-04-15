import { createGzip, createGunzip } from 'node:zlib';

/**
 * Compress a Buffer using gzip.
 */
export async function compress(input: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gzip = createGzip();
    gzip.on('data', (chunk: Buffer) => chunks.push(chunk));
    gzip.on('end', () => resolve(Buffer.concat(chunks)));
    gzip.on('error', reject);
    gzip.end(input);
  });
}

/**
 * Decompress a gzip Buffer.
 */
export async function decompress(input: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gunzip = createGunzip();
    gunzip.on('data', (chunk: Buffer) => chunks.push(chunk));
    gunzip.on('end', () => resolve(Buffer.concat(chunks)));
    gunzip.on('error', reject);
    gunzip.end(input);
  });
}