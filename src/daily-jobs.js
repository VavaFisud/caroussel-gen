import { randomUUID } from 'node:crypto';
import { slugify } from './generator.js';
import { readJsonStore, writeJsonStore } from './json-store.js';

const jobsPath = process.env.DAILY_JOBS_PATH
  || (process.env.VERCEL ? '/tmp/carousel-daily-jobs.json' : './data/daily-jobs.json');
const blobPath = 'carousel-gen/state/daily-jobs.json';

async function readStoredJobs() {
  const parsed = await readJsonStore({
    localPath: jobsPath,
    blobPath,
    fallback: []
  });
  return Array.isArray(parsed) ? parsed : [];
}

async function writeStoredJobs(jobs) {
  await writeJsonStore({ localPath: jobsPath, blobPath, value: jobs });
}

function envJob() {
  if (process.env.ENABLE_DAILY_GENERATION !== 'true') return null;
  return {
    id: 'env-daily',
    enabled: true,
    account_slug: process.env.DAILY_ACCOUNT_SLUG || '',
    template_path: process.env.DAILY_TEMPLATE_PATH || './templates/daily.template',
    time: process.env.DAILY_GENERATION_TIME || '09:00',
    topic: process.env.DAILY_TOPIC || '',
    use_gemini: process.env.DAILY_USE_GEMINI === 'true',
    send_telegram: process.env.DAILY_SEND_TELEGRAM !== 'false',
    telegram_chat_id: process.env.DAILY_TELEGRAM_CHAT_ID || '',
    last_date: null,
    last_run_at: null,
    last_status: 'idle',
    last_error: '',
    readonly: true
  };
}

export async function listDailyJobs() {
  const fromEnv = envJob();
  return [
    ...(fromEnv ? [fromEnv] : []),
    ...(await readStoredJobs())
  ];
}

export async function saveDailyJob(job) {
  const jobs = await readStoredJobs();
  const id = job.id || slugify(`${job.account_slug || 'all'}-${job.template_path || job.template_name || randomUUID()}`);
  const next = {
    id,
    enabled: job.enabled !== false,
    account_slug: job.account_slug || '',
    template_path: job.template_path || '',
    time: job.time || '09:00',
    topic: job.topic || '',
    use_gemini: Boolean(job.use_gemini),
    send_telegram: job.send_telegram !== false,
    telegram_chat_id: job.telegram_chat_id ? String(job.telegram_chat_id) : '',
    last_date: job.last_date || null,
    last_run_at: job.last_run_at || null,
    last_status: job.last_status || 'idle',
    last_error: job.last_error || ''
  };
  const index = jobs.findIndex((item) => item.id === id);
  if (index === -1) jobs.push(next);
  else jobs[index] = { ...jobs[index], ...next };
  await writeStoredJobs(jobs);
  return next;
}

export async function deleteDailyJob(id) {
  const jobs = await readStoredJobs();
  const next = jobs.filter((job) => job.id !== id);
  await writeStoredJobs(next);
  return next.length !== jobs.length;
}

export async function updateDailyJobState(id, patch) {
  if (id === 'env-daily') return;
  const jobs = await readStoredJobs();
  const index = jobs.findIndex((job) => job.id === id);
  if (index === -1) return;
  jobs[index] = { ...jobs[index], ...patch };
  await writeStoredJobs(jobs);
}
