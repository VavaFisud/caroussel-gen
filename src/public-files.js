import fs from 'node:fs';
import path from 'node:path';
import { put } from '@vercel/blob';

const registryPath = process.env.PUBLIC_FILE_REGISTRY_PATH
  || (process.env.VERCEL ? '/tmp/carousel-public-files.json' : './data/public-files.json');

function ensureRegistryDir() {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
}

function loadRegistry() {
  ensureRegistryDir();
  if (!fs.existsSync(registryPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch {
    return {};
  }
}

function saveRegistry(registry) {
  ensureRegistryDir();
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

function fileId(filePath) {
  return Buffer.from(path.resolve(filePath)).toString('base64url');
}

export function publicBaseUrl() {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_TOKEN || '';
}

export function hasBlobStorage() {
  return Boolean(blobToken());
}

export function storageMode() {
  if (hasBlobStorage()) return 'blob';
  if (process.env.VERCEL) return 'unconfigured';
  return 'local';
}

export async function publishFile(filePath, {
  pathname,
  contentType,
  access = 'public',
  addRandomSuffix = true
} = {}) {
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  const body = fs.readFileSync(resolved);
  const safePathname = pathname || path.basename(resolved);

  if (blobToken()) {
    const blob = await put(safePathname, body, {
      access,
      addRandomSuffix,
      contentType,
      token: blobToken()
    });
    return {
      id: blob.url,
      path: resolved,
      name: path.basename(resolved),
      url: blob.url,
      downloadUrl: blob.downloadUrl || blob.url,
      storage: 'blob'
    };
  }

  if (process.env.VERCEL && process.env.ALLOW_LOCAL_PUBLIC_FILES !== 'true') {
    throw new Error('Vercel Blob is not configured. Set BLOB_READ_WRITE_TOKEN in the Vercel project env.');
  }

  return registerPublicFile(resolved);
}

export function registerPublicFile(filePath) {
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  const registry = loadRegistry();
  const id = fileId(resolved);
  registry[id] = {
    path: resolved,
    name: path.basename(resolved),
    created_at: new Date().toISOString()
  };
  saveRegistry(registry);
  return {
    id,
    path: resolved,
    name: path.basename(resolved),
    url: `${publicBaseUrl()}/files/${id}`
  };
}

export function findPublicFile(id) {
  const registry = loadRegistry();
  return registry[id] || null;
}

export function enrichGenerationResult(result) {
  return {
    ...result,
    results: (result.results || []).map((item) => {
      const zip = item.zip_url
        ? { url: item.zip_url, id: item.zip_url, path: item.zip_path, name: path.basename(item.zip_path || 'carousel.zip') }
        : null;
      const slides = (item.slide_urls || []).map((url, index) => ({
        url,
        id: url,
        path: item.slide_paths?.[index],
        name: path.basename(item.slide_paths?.[index] || `slide-${index + 1}.png`)
      }));
      return {
        ...item,
        download_url: item.download_url || zip?.url || null,
        zip_file_id: item.zip_file_id || zip?.id || null,
        slide_urls: item.slide_urls || slides.map((slide) => slide.url),
        slide_file_ids: item.slide_file_ids || slides.map((slide) => slide.id)
      };
    })
  };
}
