import { randomUUID } from 'node:crypto';
import { readJsonStore, writeJsonStore } from './json-store.js';

const outboxPath = process.env.TELEGRAM_OUTBOX_PATH
  || (process.env.VERCEL ? '/tmp/carousel-telegram-outbox.json' : './data/telegram-outbox.json');
const blobPath = 'carousel-gen/state/telegram-outbox.json';

async function readStore() {
  const parsed = await readJsonStore({
    localPath: outboxPath,
    blobPath,
    fallback: { items: [] }
  });
  return { items: Array.isArray(parsed.items) ? parsed.items : [] };
}

async function writeStore(store) {
  await writeJsonStore({ localPath: outboxPath, blobPath, value: store });
}

export async function enqueueTelegramSend(request = {}) {
  const store = await readStore();
  const item = {
    id: request.id || randomUUID(),
    type: request.type || 'generate_send',
    status: 'pending',
    account_slug: request.account_slug || '',
    template_path: request.template_path || '',
    chat_id: request.chat_id ? String(request.chat_id) : '',
    topic: request.topic || '',
    use_gemini: Boolean(request.use_gemini),
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    error: '',
    result: null
  };
  store.items.unshift(item);
  store.items = store.items.slice(0, 300);
  await writeStore(store);
  return item;
}

export async function listTelegramOutbox({ limit = 80 } = {}) {
  const store = await readStore();
  return store.items.slice(0, limit);
}

export async function claimPendingTelegramOutbox({ limit = 3 } = {}) {
  const store = await readStore();
  const now = new Date().toISOString();
  const staleAfterMs = Number(process.env.TELEGRAM_OUTBOX_STALE_MS || 10 * 60 * 1000);
  const claimed = [];
  for (const item of store.items) {
    if (claimed.length >= limit) break;
    const startedAt = item.started_at ? Date.parse(item.started_at) : 0;
    const isStaleRunning = item.status === 'running' && startedAt && Date.now() - startedAt > staleAfterMs;
    if (item.status !== 'pending' && !isStaleRunning) continue;
    item.status = 'running';
    item.started_at = now;
    item.error = '';
    claimed.push(item);
  }
  if (claimed.length) await writeStore(store);
  return claimed;
}

export async function updateTelegramOutboxItem(id, patch = {}) {
  const store = await readStore();
  const index = store.items.findIndex((item) => item.id === id);
  if (index === -1) return null;
  store.items[index] = { ...store.items[index], ...patch };
  await writeStore(store);
  return store.items[index];
}
