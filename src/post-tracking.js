import { randomUUID } from 'node:crypto';
import { readJsonStore, writeJsonStore } from './json-store.js';

const postsPath = process.env.POST_TRACKING_PATH
  || (process.env.VERCEL ? '/tmp/carousel-post-tracking.json' : './data/post-tracking.json');
const blobPath = 'carousel-gen/state/post-tracking.json';

async function readStore() {
  const store = await readJsonStore({
    localPath: postsPath,
    blobPath,
    fallback: { posts: [] }
  });
  return { posts: Array.isArray(store.posts) ? store.posts : [] };
}

async function writeStore(store) {
  await writeJsonStore({ localPath: postsPath, blobPath, value: store });
}

export async function createPostTask(task = {}) {
  const store = await readStore();
  const next = {
    id: task.id || randomUUID(),
    account_slug: task.account_slug || '',
    account_name: task.account_name || '',
    chat_id: task.chat_id ? String(task.chat_id) : '',
    template_path: task.template_path || '',
    topic: task.topic || '',
    carousel_id: task.carousel_id || null,
    download_url: task.download_url || '',
    zip_path: task.zip_path || '',
    slide_urls: Array.isArray(task.slide_urls) ? task.slide_urls : [],
    slide_paths: Array.isArray(task.slide_paths) ? task.slide_paths : [],
    status: task.status || 'sent',
    sent_at: task.sent_at || new Date().toISOString(),
    posted_at: task.posted_at || null,
    posted_by: task.posted_by || '',
    telegram_message_id: task.telegram_message_id || null
  };
  store.posts.unshift(next);
  store.posts = store.posts.slice(0, 500);
  await writeStore(store);
  return next;
}

export async function markPostPosted(id, actor = {}) {
  const store = await readStore();
  const index = store.posts.findIndex((post) => post.id === id);
  if (index === -1) throw new Error(`Post task introuvable: ${id}`);
  store.posts[index] = {
    ...store.posts[index],
    status: 'posted',
    posted_at: new Date().toISOString(),
    posted_by: actor.username || actor.first_name || actor.id || ''
  };
  await writeStore(store);
  return store.posts[index];
}

export async function listPostTasks({ limit = 80, accountSlug = '', chatId = '' } = {}) {
  const store = await readStore();
  return store.posts
    .filter((post) => !accountSlug || post.account_slug === accountSlug)
    .filter((post) => !chatId || String(post.chat_id) === String(chatId))
    .slice(0, limit);
}
