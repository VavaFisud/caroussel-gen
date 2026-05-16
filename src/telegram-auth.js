import { readJsonStore, writeJsonStore } from './json-store.js';

const authPath = process.env.TELEGRAM_AUTH_PATH
  || (process.env.VERCEL ? '/tmp/carousel-telegram-auth.json' : './data/telegram-auth.json');
const blobPath = 'carousel-gen/state/telegram-auth.json';

async function readStore() {
  const store = await readJsonStore({
    localPath: authPath,
    blobPath,
    fallback: { chats: [] }
  });
  return { chats: Array.isArray(store.chats) ? store.chats : [] };
}

async function writeStore(store) {
  await writeJsonStore({ localPath: authPath, blobPath, value: store });
}

export function telegramPassword() {
  return process.env.TELEGRAM_AUTH_PASSWORD || '';
}

export function isTelegramAuthEnabled() {
  return Boolean(telegramPassword());
}

export async function isAuthorizedChat(chatId) {
  if (!isTelegramAuthEnabled()) return true;
  const id = String(chatId);
  return (await readStore()).chats.some((chat) => String(chat.id) === id);
}

export async function authorizeChat(chat) {
  const store = await readStore();
  const id = String(chat.id);
  const next = {
    id,
    type: chat.type || '',
    title: chat.title || '',
    username: chat.username || '',
    first_name: chat.first_name || '',
    last_name: chat.last_name || '',
    account_slugs: [],
    authorized_at: new Date().toISOString()
  };
  const index = store.chats.findIndex((item) => String(item.id) === id);
  if (index === -1) store.chats.push(next);
  else store.chats[index] = { ...store.chats[index], ...next, account_slugs: store.chats[index].account_slugs || [] };
  await writeStore(store);
  return next;
}

export async function revokeChat(chatId) {
  const store = await readStore();
  const id = String(chatId);
  const nextChats = store.chats.filter((chat) => String(chat.id) !== id);
  await writeStore({ chats: nextChats });
  return nextChats.length !== store.chats.length;
}

export async function listAuthorizedChats() {
  return (await readStore()).chats;
}

export async function assignChatAccounts(chatId, accountSlugs = []) {
  const store = await readStore();
  const id = String(chatId);
  const index = store.chats.findIndex((chat) => String(chat.id) === id);
  if (index === -1) throw new Error(`Chat introuvable: ${chatId}`);
  store.chats[index] = {
    ...store.chats[index],
    account_slugs: [...new Set((accountSlugs || []).map((slug) => String(slug || '').trim()).filter(Boolean))],
    assigned_at: new Date().toISOString()
  };
  await writeStore(store);
  return store.chats[index];
}

export async function chatsForAccount(accountSlug) {
  const slug = String(accountSlug || '').trim();
  return (await listAuthorizedChats()).filter((chat) => (chat.account_slugs || []).includes(slug));
}

export async function isChatAssignedToAccount(chatId, accountSlug) {
  const id = String(chatId || '');
  const slug = String(accountSlug || '').trim();
  if (!id || !slug) return false;
  return (await listAuthorizedChats()).some((chat) => (
    String(chat.id) === id && (chat.account_slugs || []).includes(slug)
  ));
}
