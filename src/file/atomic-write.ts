/**
 * Atomic file operations.
 *
 * For sensitive state like Signal key material, we MUST avoid partial
 * writes (file corruption due to crash mid-write). The pattern:
 *
 *   1. Write to `<path>.tmp.<random>`
 *   2. fsync() to flush kernel buffers
 *   3. rename() to final path (POSIX guarantees atomicity on same FS)
 *
 * The result: at any moment, the file on disk is either the OLD value
 * OR the NEW value — never something in between.
 *
 * @module storage/file/atomic-write
 */

import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/**
 * Write `data` to `targetPath` atomically.
 *
 * Creates the parent directory if needed.
 *
 * On Windows, the final `rename()` can transiently fail with `EPERM` when
 * the target file is being concurrently accessed (e.g. by AV scan, indexer,
 * or another concurrent write to the same path). We retry a few times with
 * small backoffs before giving up — this is a known Windows quirk.
 */
export async function atomicWriteFile(
  targetPath: string,
  data: string | Buffer,
): Promise<void> {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });

  // tmp path: same directory (so rename stays on same filesystem)
  const tmpPath = `${targetPath}.tmp.${randomBytes(8).toString('hex')}`;

  let fileHandle: fs.FileHandle | undefined;
  try {
    fileHandle = await fs.open(tmpPath, 'w', 0o600); // owner read/write only
    await fileHandle.writeFile(data);
    await fileHandle.sync();
    await fileHandle.close();
    fileHandle = undefined;

    // Atomic rename with retry for Windows EPERM
    await renameWithRetry(tmpPath, targetPath);
  } catch (err) {
    // Best-effort cleanup if anything went wrong
    if (fileHandle !== undefined) {
      try {
        await fileHandle.close();
      } catch {
        /* ignore */
      }
    }
    try {
      await fs.unlink(tmpPath);
    } catch {
      /* ignore — may not exist */
    }
    throw err;
  }
}

/**
 * Rename with retry on transient Windows EPERM/EBUSY/EACCES.
 *
 * On POSIX, rename is atomic and rarely fails for permission reasons mid-op.
 * On Windows, anti-virus, file indexers, and concurrent access can cause
 * transient EPERM/EBUSY. We retry up to 5 times with exponential backoff.
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  const MAX_ATTEMPTS = 5;
  const RETRYABLE_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException).code;
      if (!RETRYABLE_CODES.has(code ?? '')) {
        throw err;
      }
      // Exponential backoff: 1ms, 2ms, 4ms, 8ms, 16ms
      const delay = 1 << attempt;
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}

/**
 * Read `path` as UTF-8 text, returning null if the file doesn't exist.
 * (Other errors — permission denied, IO error — still throw.)
 */
export async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Delete `path`, no-op if it doesn't exist.
 */
export async function unlinkIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
}

/**
 * List files in `dir` (non-recursive). Returns [] if the directory
 * doesn't exist. Filters to filenames matching `predicate` (default: all).
 */
export async function listFiles(
  dir: string,
  predicate?: (name: string) => boolean,
): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => (predicate ? predicate(name) : true));
}
