import dotenv from 'dotenv';
import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import TelegramBot from 'node-telegram-bot-api';
import { getAccount, loadAccountsAsync, saveAccount } from './account-store.js';
import { deleteDailyJob, listDailyJobs, saveDailyJob } from './daily-jobs.js';
import { getCarousel, getStatus, listCarousels } from './db.js';
import { generateForAccounts, generateForAllAccounts } from './generator.js';
import { clearGeminiSettings, getGeminiSettings, saveGeminiMode, saveGeminiSettings } from './gemini-settings.js';
import { listPostTasks } from './post-tracking.js';
import { findPublicFile, publishFile, storageMode } from './public-files.js';
import { getSchedulerStatus, startDailyScheduler } from './scheduler.js';
import { assignChatAccounts, isChatAssignedToAccount, listAuthorizedChats } from './telegram-auth.js';
import { enqueueTelegramSend, listTelegramOutbox } from './telegram-outbox.js';
import { sendCarouselSlidesToChat } from './telegram-delivery.js';
import { normalizeTemplate } from './template-normalizer.js';
import { templateWithGemini } from './gemini-cli.js';
import { TEMPLATE_JSON_DOC } from './template-doc.js';
import { listTemplatesAsync, loadStoredTemplateAsync, saveTemplateAsync } from './template-store.js';

dotenv.config();

const adminUser = process.env.ADMIN_USER || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'change_me';
const sessionSecret = process.env.ADMIN_SESSION_SECRET || `${adminUser}:${adminPassword}:carousel-gen`;
const sessionMaxAgeSeconds = 60 * 60 * 24 * 14;

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf('=');
      return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }));
}

function signSession(value) {
  return crypto.createHmac('sha256', sessionSecret).update(value).digest('base64url');
}

function createSessionToken() {
  const payload = Buffer.from(JSON.stringify({
    user: adminUser,
    exp: Date.now() + (sessionMaxAgeSeconds * 1000)
  })).toString('base64url');
  return `${payload}.${signSession(payload)}`;
}

function readSession(req) {
  const token = parseCookies(req).cg_admin;
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (signature !== signSession(payload)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function isPublicAsset(req) {
  return req.path === '/style.css' || req.path === '/favicon.ico';
}

function requireAdmin(req, res, next) {
  if (req.path === '/login' || req.path === '/api/admin/login' || isPublicAsset(req)) {
    next();
    return;
  }
  if (readSession(req)) {
    next();
    return;
  }
  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'Authentification admin requise.' });
    return;
  }
  res.redirect('/login');
}

export function createDashboardApp({ startScheduler = false } = {}) {
  const app = express();
  const dashboardDir = path.join(process.cwd(), 'dashboard');

  app.use(express.json({ limit: '20mb' }));
  app.get('/login', (req, res) => {
    res.sendFile(path.join(dashboardDir, 'login.html'));
  });

  app.post('/api/admin/login', (req, res) => {
    const { username = '', password = '' } = req.body || {};
    if (String(username) !== adminUser || String(password) !== adminPassword) {
      res.status(401).json({ error: 'Identifiants invalides.' });
      return;
    }
    res.setHeader('Set-Cookie', [
      `cg_admin=${encodeURIComponent(createSessionToken())}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionMaxAgeSeconds}${process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : ''}`
    ]);
    res.json({ ok: true, user: adminUser });
  });

  app.post('/api/admin/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'cg_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.json({ ok: true });
  });

  app.all(['/api/telegram/*', '/api/cron/*'], (req, res) => {
    res.status(404).json({ error: 'Route disabled on this deployment.' });
  });

  app.use(requireAdmin);
  app.use(express.static(dashboardDir));

  app.get('/builder', (req, res) => {
    res.sendFile(path.join(dashboardDir, 'builder.html'));
  });

  app.get('/doc', (req, res) => {
    res.sendFile(path.join(dashboardDir, 'doc.html'));
  });

  app.get('/api/carousels', (req, res) => {
    const limit = Math.min(Number(req.query.limit || 20), 100);
    res.json({ carousels: listCarousels(limit) });
  });

  app.get('/api/carousels/:id/download', (req, res) => {
    const carousel = getCarousel(req.params.id);
    if (!carousel) {
      res.status(404).json({ error: 'Carousel introuvable.' });
      return;
    }
    if (!carousel.zip_path || !fs.existsSync(carousel.zip_path)) {
      res.status(404).json({ error: 'ZIP introuvable sur le disque.' });
      return;
    }

    res.download(carousel.zip_path, `${carousel.account_slug}-${carousel.id}-carousel.zip`);
  });

  app.get('/files/:id', (req, res) => {
    const file = findPublicFile(req.params.id);
    if (!file) {
      res.status(404).json({ error: 'File not found or expired.' });
      return;
    }
    res.download(file.path, file.name);
  });

  app.post('/api/upload-image', async (req, res) => {
    try {
      const { filename = 'image.png', mimeType = 'image/png', dataUrl } = req.body || {};
      if (!dataUrl?.startsWith('data:')) {
        res.status(400).json({ error: 'dataUrl est obligatoire.' });
        return;
      }

      const match = String(dataUrl).match(/^data:(.*?);base64,(.*)$/);
      if (!match) {
        res.status(400).json({ error: 'dataUrl invalide.' });
        return;
      }

      const contentType = mimeType || match[1] || 'image/png';
      const buffer = Buffer.from(match[2], 'base64');
      const tempPath = path.join('/tmp', `${Date.now()}-${filename}`);
      fs.writeFileSync(tempPath, buffer);
      const published = await publishFile(tempPath, {
        pathname: `carousel-gen/uploads/${Date.now()}-${filename}`,
        contentType
      });
      fs.unlinkSync(tempPath);
      res.json({ url: published?.url, downloadUrl: published?.downloadUrl || published?.url, storage: published?.storage || 'local' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/generate', async (req, res) => {
    try {
      const result = await generateForAllAccounts(req.body);
      res.status(201).json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  app.get('/api/admin/state', async (req, res) => {
    res.json({
      status: getStatus(),
      storage_mode: storageMode(),
      accounts: await loadAccountsAsync(),
      chats: await listAuthorizedChats(),
      templates: await listTemplatesAsync(),
      jobs: await listDailyJobs(),
      posts: await listPostTasks({ limit: 80 }),
      outbox: await listTelegramOutbox({ limit: 40 }),
      scheduler: await getSchedulerStatus(),
      gemini: await getGeminiSettings()
    });
  });

  app.post('/api/admin/accounts', async (req, res) => {
    try {
      res.status(201).json(await saveAccount(req.body || {}));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/admin/templates', async (req, res) => {
    try {
      const { account_slug = 'global', template_name = '', template } = req.body || {};
      const normalized = normalizeTemplate(template || {});
      const saved_path = await saveTemplateAsync({
        accountSlug: account_slug || 'global',
        name: template_name || normalized.cover_title || 'template',
        template: normalized
      });
      res.status(201).json({ ok: true, saved_path, template: normalized });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/admin/templates/resolve', async (req, res) => {
    try {
      const templatePath = String(req.query.path || '');
      if (!templatePath) {
        res.status(400).json({ error: 'path est obligatoire.' });
        return;
      }
      const template = normalizeTemplate(await loadStoredTemplateAsync(templatePath));
      const item = (await listTemplatesAsync()).find((entry) => entry.path === templatePath);
      res.json({
        ok: true,
        name: item?.name || 'template',
        account_slug: item?.account_slug || '',
        template
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/admin/assign', async (req, res) => {
    try {
      res.json(await assignChatAccounts(req.body?.chat_id, req.body?.account_slugs || []));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/admin/daily', async (req, res) => {
    try {
      const { account_slug, telegram_chat_id } = req.body || {};
      if (account_slug && telegram_chat_id && !(await isChatAssignedToAccount(telegram_chat_id, account_slug))) {
        res.status(400).json({ error: `Ce VA n'est pas assigne au compte ${account_slug}. Attribue-le d'abord dans la section VA.` });
        return;
      }
      res.status(201).json(await saveDailyJob(req.body || {}));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/admin/daily/:id', async (req, res) => {
    res.json({ ok: await deleteDailyJob(req.params.id) });
  });

  app.post('/api/admin/generate-send', async (req, res) => {
    try {
      const { account_slug, template_path, chat_id } = req.body || {};
      const topic = String(req.body?.topic || '').trim();
      const useGemini = req.body?.use_gemini !== false;
      if (!account_slug || !template_path || !chat_id) {
        res.status(400).json({ error: 'account_slug, template_path et chat_id sont obligatoires.' });
        return;
      }
      if (!(await isChatAssignedToAccount(chat_id, account_slug))) {
        res.status(400).json({ error: `Ce VA n'est pas assigne au compte ${account_slug}. Attribue-le d'abord dans la section VA.` });
        return;
      }
      if (process.env.VERCEL || !process.env.TELEGRAM_BOT_TOKEN) {
        const queued = await enqueueTelegramSend({
          account_slug,
          template_path,
          chat_id,
          topic,
          use_gemini: useGemini
        });
        res.status(202).json({
          ok: true,
          queued: true,
          outbox_item: queued,
          message: 'Demande ajoutee a la file Telegram. Le bot local/VPS va generer et envoyer le carousel.'
        });
        return;
      }

      const account = await getAccount(account_slug);
      if (!account) throw new Error(`Compte introuvable: ${account_slug}`);
      const baseTemplate = normalizeTemplate(await loadStoredTemplateAsync(template_path));
      const template = useGemini
        ? await templateWithGemini({ topic: topic || baseTemplate.cover_title, baseTemplate, account })
        : baseTemplate;
      const result = await generateForAccounts(template, { accountSlugs: [account_slug] });
      const item = result.results.find((entry) => entry.account_slug === account_slug);
      if (!item?.slide_urls?.length && !item?.slide_paths?.length) throw new Error('Slides PNG introuvables.');

      const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
      await sendCarouselSlidesToChat(bot, chat_id, item, { templatePath: template_path, topic });
      await bot.close?.();

      res.status(201).json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  app.post('/api/normalize-template', (req, res) => {
    try {
      res.json(normalizeTemplate(req.body || {}));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/template-doc', (req, res) => {
    res.type('text/plain').send(TEMPLATE_JSON_DOC);
  });

  app.get('/api/status', async (req, res) => {
    res.json({
      ...getStatus(),
      storage_mode: storageMode(),
      gemini: await getGeminiSettings()
    });
  });

  app.get('/api/gemini/status', async (req, res) => {
    res.json(await getGeminiSettings());
  });

  app.post('/api/gemini/login', async (req, res) => {
    try {
      res.json(await saveGeminiSettings({
        apiKey: req.body?.api_key,
        model: req.body?.model
      }));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/gemini/mode', async (req, res) => {
    try {
      const mode = req.body?.mode || 'auto';
      res.json(await saveGeminiMode({
        mode,
        enableCli: mode === 'cli' ? true : req.body?.enable_cli,
        model: req.body?.model || ''
      }));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/gemini/logout', async (req, res) => {
    res.json(await clearGeminiSettings());
  });

  app.get('/api/scheduler/status', async (req, res) => {
    res.json(await getSchedulerStatus());
  });

  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(dashboardDir, 'index.html'));
  });

  if (startScheduler) startDailyScheduler();
  return app;
}
