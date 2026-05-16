import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { getAccount } from './account-store.js';
import { listDailyJobs, updateDailyJobState } from './daily-jobs.js';
import { generateForAccounts } from './generator.js';
import { templateWithGemini } from './gemini-cli.js';
import { sendCarouselSlidesToChat } from './telegram-delivery.js';
import { loadStoredTemplateAsync } from './template-store.js';
import { normalizeTemplate } from './template-normalizer.js';
import { chatsForAccount, isChatAssignedToAccount } from './telegram-auth.js';

dotenv.config();

const state = {
  enabled: process.env.ENABLE_DAILY_GENERATION === 'true',
  time: process.env.DAILY_GENERATION_TIME || '09:00',
  templatePath: process.env.DAILY_TEMPLATE_PATH || './templates/daily.template',
  lastDate: null,
  lastRunAt: null,
  lastStatus: 'idle',
  lastError: '',
  jobs: [],
  runningJobs: [],
  intervalId: null
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function currentTimeKey() {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: process.env.APP_TIME_ZONE || 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const hour = parts.find((part) => part.type === 'hour')?.value || '00';
  const minute = parts.find((part) => part.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
}

function minutesOfDay(value) {
  const [hours = '0', minutes = '0'] = String(value || '00:00').split(':');
  return (Number(hours) * 60) + Number(minutes);
}

async function readTemplate(templatePath) {
  if (String(templatePath || '').startsWith('blob://')) {
    return loadStoredTemplateAsync(templatePath);
  }
  const resolved = path.resolve(process.cwd(), templatePath);
  return loadStoredTemplateAsync(resolved);
}

async function telegramSendGeneration(bot, result, account, template, chatId = '') {
  const targetChatId = chatId || account?.telegram_chat_id || '';
  if (!bot || !targetChatId || String(targetChatId).startsWith('TELEGRAM_CHAT_ID')) return;
  if (account?.slug && !(await isChatAssignedToAccount(targetChatId, account.slug))) {
    throw new Error(`Ce VA n'est pas assigne au compte ${account.slug}.`);
  }
  for (const item of result.results || []) {
    if (account?.slug && item.account_slug !== account.slug) continue;
    await sendCarouselSlidesToChat(bot, targetChatId, item, {
      templatePath: template.source_template_filename || '',
      topic: template.cover_title || '',
      intro: `📌 Daily carousel - ${account?.name || item.account_name || item.account_slug}`
    });
  }
}

export async function runDailyJob(job, { bot = null } = {}) {
  const account = job.account_slug ? await getAccount(job.account_slug) : null;
  if (job.account_slug && !account) throw new Error(`Compte introuvable: ${job.account_slug}`);

  const baseTemplate = normalizeTemplate(await readTemplate(job.template_path));
  const template = job.use_gemini
    ? await templateWithGemini({ topic: job.topic || baseTemplate.cover_title, baseTemplate, account: account || {} })
    : baseTemplate;

  state.lastStatus = 'running';
  state.lastError = '';
  state.lastRunAt = new Date().toISOString();
  await updateDailyJobState(job.id, {
    last_status: 'running',
    last_error: '',
    last_run_at: state.lastRunAt
  });

  const result = await generateForAccounts(template, {
    accountSlugs: job.account_slug ? [job.account_slug] : []
  });

  if (job.send_telegram !== false && (account || job.telegram_chat_id)) {
    if (job.telegram_chat_id) {
      await telegramSendGeneration(bot, result, account, template, job.telegram_chat_id);
    } else if (account?.slug) {
      const chats = await chatsForAccount(account.slug);
      for (const chat of chats) await telegramSendGeneration(bot, result, account, template, chat.id);
    }
  }

  const donePatch = {
    last_status: 'done',
    last_error: '',
    last_date: todayKey(),
    last_run_at: new Date().toISOString()
  };
  await updateDailyJobState(job.id, donePatch);
  state.lastStatus = 'done';
  state.lastDate = todayKey();
  state.jobs = await listDailyJobs();
  return result;
}

function shouldRun(job) {
  if (!job.enabled) return false;
  if (!job.template_path) return false;
  if (!String(job.template_path).startsWith('blob://') && !fs.existsSync(path.resolve(process.cwd(), job.template_path))) return false;
  if (job.last_status === 'running') return false;
  if (job.last_date === todayKey()) return false;
  return minutesOfDay(currentTimeKey()) >= minutesOfDay(job.time || '09:00');
}

export async function runDueDailyJobs({ bot = null } = {}) {
  const jobs = await listDailyJobs();
  state.enabled = jobs.some((job) => job.enabled);
  state.jobs = jobs;
  const results = [];
  for (const job of jobs) {
    if (!shouldRun(job)) continue;
    if (state.runningJobs.includes(job.id)) continue;
    state.runningJobs.push(job.id);
    try {
      results.push({ job_id: job.id, result: await runDailyJob(job, { bot }) });
    } catch (error) {
      state.lastStatus = 'error';
      state.lastError = error.message;
      await updateDailyJobState(job.id, {
        last_status: 'error',
        last_error: error.message,
        last_run_at: new Date().toISOString()
      });
      results.push({ job_id: job.id, error: error.message });
    } finally {
      state.runningJobs = state.runningJobs.filter((id) => id !== job.id);
      state.jobs = await listDailyJobs();
    }
  }
  return results;
}

export function startDailyScheduler({ bot = null } = {}) {
  if (state.intervalId) return state;
  const tick = () => {
    runDueDailyJobs({ bot }).catch((error) => {
      state.lastStatus = 'error';
      state.lastError = error.message;
    });
  };
  state.intervalId = setInterval(tick, 60_000);
  tick();
  return state;
}

export async function getSchedulerStatus() {
  return {
    ...state,
    jobs: await listDailyJobs()
  };
}
