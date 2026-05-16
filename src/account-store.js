import fs from 'node:fs';
import path from 'node:path';
import { readJsonStore, writeJsonStore } from './json-store.js';

const accountsDir = path.join(process.cwd(), 'accounts');
const writableAccountsDir = process.env.VERCEL ? '/tmp/accounts' : accountsDir;
const accountsStatePath = process.env.ACCOUNTS_STATE_PATH
  || (process.env.VERCEL ? '/tmp/carousel-accounts.json' : './data/accounts.json');
const accountsBlobPath = 'carousel-gen/state/accounts.json';

export function accountSlugify(input) {
  return String(input || 'account')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'account';
}

function readBundledAccounts() {
  if (!fs.existsSync(accountsDir)) return [];
  return fs.readdirSync(accountsDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => JSON.parse(fs.readFileSync(path.join(accountsDir, file), 'utf8')));
}

function readWritableAccounts() {
  if (!fs.existsSync(writableAccountsDir)) return [];
  return fs.readdirSync(writableAccountsDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => JSON.parse(fs.readFileSync(path.join(writableAccountsDir, file), 'utf8')));
}

function mergeAccounts(...groups) {
  const map = new Map();
  for (const account of groups.flat()) {
    if (!account?.slug) continue;
    map.set(account.slug, { ...(map.get(account.slug) || {}), ...account });
  }
  return [...map.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

async function readManagedAccounts() {
  const parsed = await readJsonStore({
    localPath: accountsStatePath,
    blobPath: accountsBlobPath,
    fallback: []
  });
  return Array.isArray(parsed) ? parsed : [];
}

async function writeManagedAccounts(accounts) {
  await writeJsonStore({
    localPath: accountsStatePath,
    blobPath: accountsBlobPath,
    value: accounts
  });
}

export function loadAccountsSync() {
  const localState = (() => {
    if (process.env.VERCEL || !fs.existsSync(accountsStatePath)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(accountsStatePath, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  return mergeAccounts(readBundledAccounts(), localState, readWritableAccounts());
}

export async function loadAccountsAsync() {
  return mergeAccounts(readBundledAccounts(), await readManagedAccounts(), readWritableAccounts());
}

export async function getAccount(accountSlug) {
  return (await loadAccountsAsync()).find((account) => account.slug === accountSlug);
}

export async function saveAccountDa(accountSlug, da, handle = '') {
  const account = await getAccount(accountSlug);
  if (!account) {
    throw new Error(`Compte introuvable: ${accountSlug}`);
  }

  const nextAccount = {
    ...account,
    handle: handle || account.handle,
    da: {
      ...(account.da || {}),
      ...(da || {})
    }
  };

  fs.mkdirSync(writableAccountsDir, { recursive: true });
  const filePath = path.join(writableAccountsDir, `${accountSlug}.json`);
  fs.writeFileSync(filePath, JSON.stringify(nextAccount, null, 2));
  const managed = await readManagedAccounts();
  const index = managed.findIndex((item) => item.slug === accountSlug);
  if (index === -1) managed.push(nextAccount);
  else managed[index] = nextAccount;
  await writeManagedAccounts(managed);
  return nextAccount;
}

export async function saveAccount(accountData = {}) {
  const slug = accountSlugify(accountData.slug || accountData.handle || accountData.name || 'account');
  const existing = (await getAccount(slug)) || {};
  const nextAccount = {
    ...existing,
    slug,
    name: accountData.name || existing.name || slug,
    handle: accountData.handle || existing.handle || '',
    telegram_chat_id: accountData.telegram_chat_id || existing.telegram_chat_id || '',
    default_template_path: accountData.default_template_path || existing.default_template_path || '',
    daily_time: accountData.daily_time || existing.daily_time || '09:00',
    daily_topic: accountData.daily_topic || existing.daily_topic || '',
    daily_use_gemini: Boolean(accountData.daily_use_gemini ?? existing.daily_use_gemini),
    language: accountData.language || existing.language || 'francais',
    cta_type: accountData.cta_type || existing.cta_type || 'ebook',
    cta_keyword: accountData.cta_keyword || existing.cta_keyword || '',
    cta_offer: accountData.cta_offer || existing.cta_offer || 'ebook sommeil bebe en bio',
    cta_instruction: accountData.cta_instruction || existing.cta_instruction || '',
    da: {
      ...(existing.da || {}),
      ...(accountData.da || {})
    }
  };

  fs.mkdirSync(writableAccountsDir, { recursive: true });
  const filePath = path.join(writableAccountsDir, `${slug}.json`);
  fs.writeFileSync(filePath, JSON.stringify(nextAccount, null, 2));
  const managed = await readManagedAccounts();
  const index = managed.findIndex((item) => item.slug === slug);
  if (index === -1) managed.push(nextAccount);
  else managed[index] = nextAccount;
  await writeManagedAccounts(managed);
  return nextAccount;
}

export async function deleteAccount(accountSlug) {
  const slug = accountSlugify(accountSlug);
  const filePath = path.join(writableAccountsDir, `${slug}.json`);
  const hadFile = fs.existsSync(filePath);
  if (hadFile) fs.unlinkSync(filePath);
  const managed = await readManagedAccounts();
  const next = managed.filter((account) => account.slug !== slug);
  await writeManagedAccounts(next);
  return next.length !== managed.length || hadFile;
}
