import fs from 'node:fs';
import path from 'node:path';
import { get, list, put } from '@vercel/blob';

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_TOKEN || '';
}

function useBlobStore() {
  return Boolean(blobToken() && process.env.STATE_STORE !== 'local' && process.env.JSON_STORE_USE_BLOB !== 'false');
}

function blobAccess() {
  return process.env.BLOB_STORE_ACCESS || 'public';
}

async function blobResponseText(blob) {
  if (blob?.blob?.text) return blob.blob.text();
  if (!blob?.stream) return '';
  let text = '';
  for await (const chunk of blob.stream) {
    text += Buffer.from(chunk).toString('utf8');
  }
  return text;
}

export async function readJsonStore({ localPath, blobPath, fallback }) {
  if (useBlobStore()) {
    try {
      const access = blobAccess();
      const versions = await list({
        prefix: `${blobPath}.v/`,
        token: blobToken(),
        limit: 100
      }).catch(() => null);
      const latest = versions?.blobs
        ?.filter((item) => item.pathname.startsWith(`${blobPath}.v/`))
        ?.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];
      const blob = latest
        ? { stream: null, url: latest.url }
        : await get(blobPath, { access, token: blobToken() }).catch(() => null);
      if (!blob) return fallback;
      if (blob.url && !blob.stream && !blob.blob) {
        const response = await fetch(blob.url, { cache: 'no-store' });
        return JSON.parse(await response.text());
      }
      const text = await blobResponseText(blob);
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  }

  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  if (!fs.existsSync(localPath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(localPath, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function writeJsonStore({ localPath, blobPath, value }) {
  if (useBlobStore()) {
    const versionPath = `${blobPath}.v/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    await put(versionPath, JSON.stringify(value, null, 2), {
      access: blobAccess(),
      contentType: 'application/json',
      addRandomSuffix: false,
      token: blobToken()
    });
    return;
  }

  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, JSON.stringify(value, null, 2));
}
