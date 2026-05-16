import fs from 'node:fs';
import path from 'node:path';
import { slugify } from './generator.js';
import { readJsonStore, writeJsonStore } from './json-store.js';

const bundledTemplatesDir = path.join(process.cwd(), 'saved-templates');
const templatesDir = process.env.VERCEL ? '/tmp/saved-templates' : bundledTemplatesDir;
const templatesStatePath = process.env.TEMPLATES_STATE_PATH
  || (process.env.VERCEL ? '/tmp/carousel-templates.json' : './data/templates.json');
const templatesBlobPath = 'carousel-gen/state/templates.json';

async function readManagedTemplates() {
  const parsed = await readJsonStore({
    localPath: templatesStatePath,
    blobPath: templatesBlobPath,
    fallback: []
  });
  return Array.isArray(parsed) ? parsed : [];
}

async function writeManagedTemplates(templates) {
  await writeJsonStore({
    localPath: templatesStatePath,
    blobPath: templatesBlobPath,
    value: templates
  });
}

export function ensureTemplateStore() {
  fs.mkdirSync(templatesDir, { recursive: true });
}

export function templatePathFor(accountSlug, name) {
  ensureTemplateStore();
  const safeAccount = slugify(accountSlug || 'global');
  const safeName = slugify(name || 'template');
  const dir = path.join(templatesDir, safeAccount);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${safeName}.template`);
}

export function saveTemplate({ accountSlug = 'global', name, template }) {
  const filePath = templatePathFor(accountSlug, name || template.cover_title);
  fs.writeFileSync(filePath, JSON.stringify(template, null, 2));
  return filePath;
}

export async function saveTemplateAsync({ accountSlug = 'global', name, template }) {
  const safeAccount = slugify(accountSlug || 'global');
  const safeName = slugify(name || template.cover_title || 'template');
  const filePath = saveTemplate({ accountSlug: safeAccount, name: safeName, template });
  const managed = await readManagedTemplates();
  const record = {
    account_slug: safeAccount,
    name: safeName,
    path: `blob://${safeAccount}/${safeName}.template`,
    template,
    updated_at: new Date().toISOString()
  };
  const index = managed.findIndex((item) => item.account_slug === safeAccount && item.name === safeName);
  if (index === -1) managed.push(record);
  else managed[index] = record;
  await writeManagedTemplates(managed);
  return record.path;
}

export function listTemplates(accountSlug = '') {
  ensureTemplateStore();
  const baseDirs = [...new Set([bundledTemplatesDir, templatesDir])].filter((dir) => fs.existsSync(dir));
  const roots = accountSlug
    ? baseDirs.map((dir) => path.join(dir, slugify(accountSlug)))
    : baseDirs.flatMap((baseDir) => fs.readdirSync(baseDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(baseDir, entry.name)));

  const seen = new Set();
  return roots.flatMap((dir) => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((file) => file.endsWith('.template'))
      .map((file) => {
        const filePath = path.join(dir, file);
        const key = `${path.basename(dir)}/${file}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return {
          account_slug: path.basename(dir),
          name: file.replace(/\.template$/, ''),
          path: path.relative(process.cwd(), filePath),
          updated_at: fs.statSync(filePath).mtime.toISOString()
        };
      })
      .filter(Boolean);
  });
}

export function loadStoredTemplate(templatePath) {
  const resolved = path.resolve(process.cwd(), templatePath);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

export async function listTemplatesAsync(accountSlug = '') {
  const filesystemTemplates = listTemplates(accountSlug);
  const managed = (await readManagedTemplates())
    .filter((item) => !accountSlug || item.account_slug === slugify(accountSlug))
    .map((item) => ({
      account_slug: item.account_slug,
      name: item.name,
      path: item.path || `blob://${item.account_slug}/${item.name}.template`,
      updated_at: item.updated_at || new Date(0).toISOString()
    }));

  const seen = new Set();
  return [...managed, ...filesystemTemplates]
    .filter((item) => {
      const key = `${item.account_slug}/${item.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => `${a.account_slug}/${a.name}`.localeCompare(`${b.account_slug}/${b.name}`));
}

export async function loadStoredTemplateAsync(templatePath) {
  if (String(templatePath || '').startsWith('blob://')) {
    const managed = await readManagedTemplates();
    const record = managed.find((item) => item.path === templatePath);
    if (!record?.template) throw new Error(`Template introuvable: ${templatePath}`);
    return record.template;
  }
  return loadStoredTemplate(templatePath);
}
