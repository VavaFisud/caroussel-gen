import { readJsonStore, writeJsonStore } from './json-store.js';

const settingsPath = process.env.GEMINI_SETTINGS_PATH
  || (process.env.VERCEL ? '/tmp/carousel-gemini-settings.json' : './data/gemini-settings.json');
const blobPath = 'carousel-gen/state/gemini-settings.json';

async function readSettingsFile() {
  return readJsonStore({
    localPath: settingsPath,
    blobPath,
    fallback: {}
  });
}

async function writeSettingsFile(settings) {
  await writeJsonStore({ localPath: settingsPath, blobPath, value: settings });
}

export async function getGeminiSettings() {
  const stored = await readSettingsFile();
  const apiKey = process.env.GEMINI_API_KEY || stored.api_key || '';
  const cliEnabled = process.env.ENABLE_GEMINI_CLI === 'true' || stored.enable_cli === true;
  const source = process.env.GEMINI_API_KEY
    ? 'env'
    : (stored.api_key ? 'dashboard' : (cliEnabled ? 'cli' : 'none'));
  return {
    configured: Boolean(apiKey || cliEnabled),
    source,
    model: process.env.GEMINI_MODEL || stored.model || 'gemini-2.5-flash',
    mode: process.env.GEMINI_MODE || stored.mode || 'auto',
    cli_enabled: cliEnabled,
    cli_source: process.env.ENABLE_GEMINI_CLI === 'true' ? 'env' : (stored.enable_cli === true ? 'settings' : 'none')
  };
}

export async function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || (await readSettingsFile()).api_key || '';
}

export async function saveGeminiSettings({ apiKey, model = 'gemini-2.5-flash' }) {
  if (!apiKey || String(apiKey).trim().length < 10) {
    throw new Error('Cle API Gemini invalide.');
  }
  const stored = await readSettingsFile();
  await writeSettingsFile({
    ...stored,
    api_key: String(apiKey).trim(),
    model: String(model || 'gemini-2.5-flash').trim(),
    updated_at: new Date().toISOString()
  });
  return getGeminiSettings();
}

export async function saveGeminiMode({ mode = 'auto', enableCli = null, model = '' } = {}) {
  const normalizedMode = String(mode || 'auto').trim().toLowerCase();
  if (!['auto', 'api', 'cli'].includes(normalizedMode)) {
    throw new Error('Mode Gemini invalide. Utilise auto, api ou cli.');
  }
  const stored = await readSettingsFile();
  await writeSettingsFile({
    ...stored,
    mode: normalizedMode,
    enable_cli: enableCli === null ? stored.enable_cli === true : Boolean(enableCli),
    model: model ? String(model).trim() : stored.model,
    updated_at: new Date().toISOString()
  });
  return getGeminiSettings();
}

export async function clearGeminiSettings() {
  await writeSettingsFile({});
  return getGeminiSettings();
}
