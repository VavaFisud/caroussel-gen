import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import { loadAccountsAsync, getAccount } from './account-store.js';
import { listDailyJobs } from './daily-jobs.js';
import { generateForAccounts } from './generator.js';
import { templateWithGemini } from './gemini-cli.js';
import { startDailyScheduler } from './scheduler.js';
import { markPostPosted } from './post-tracking.js';
import {
  authorizeChat,
  isAuthorizedChat,
  isTelegramAuthEnabled,
  listAuthorizedChats,
  revokeChat,
  telegramPassword,
  isChatAssignedToAccount
} from './telegram-auth.js';
import { claimPendingTelegramOutbox, updateTelegramOutboxItem } from './telegram-outbox.js';
import { sendCarouselSlidesToChat } from './telegram-delivery.js';
import { loadStoredTemplateAsync } from './template-store.js';
import { normalizeTemplate } from './template-normalizer.js';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

function vaMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📲 Mes comptes', callback_data: 'my_accounts' }],
      [{ text: '❔ Aide', callback_data: 'help' }]
    ]
  };
}

function welcomeText() {
  return [
    '👋 Bienvenue sur le bot VA CarouselGen.',
    '',
    '🎯 Ton job ici: recevoir les carousels prêts à poster.',
    "🖼️ Tu reçois les PNG dans l'ordre, tu les publies sur Instagram, puis tu confirmes avec le bouton ✅ J'ai posté."
  ].join('\n');
}

function helpText() {
  return [
    '📌 Mode VA',
    '',
    "1. L'admin t'assigne un ou plusieurs comptes depuis le dashboard.",
    "2. Chaque jour, le bot t'envoie les PNG du carousel.",
    "3. Tu postes les slides dans l'ordre sur Instagram.",
    "4. Tu cliques sur \"✅ J'ai posté\" sous le message du bot.",
    '',
    'Commandes utiles:',
    '/start - ouvrir le menu',
    '/mes_comptes - voir les comptes qui te sont assignes',
    '/logout - deconnecter ce chat'
  ].join('\n');
}

async function requireAuth(bot, msgOrQuery) {
  const chat = msgOrQuery.message?.chat || msgOrQuery.chat;
  if (!chat) return false;
  if (await isAuthorizedChat(chat.id)) return true;
  await bot.sendMessage(chat.id, 'Envoie le mot de passe donne par l admin pour activer ce chat.');
  return false;
}

async function assignedAccounts(chatId) {
  const chat = (await listAuthorizedChats()).find((item) => String(item.id) === String(chatId));
  const slugs = chat?.account_slugs || [];
  return (await loadAccountsAsync()).filter((account) => slugs.includes(account.slug));
}

async function showMyAccounts(bot, chatId) {
  const accounts = await assignedAccounts(chatId);
  if (accounts.length === 0) {
    await bot.sendMessage(
      chatId,
      'Aucun compte ne t est encore assigne. Demande a l admin de t attribuer un compte dans le dashboard.',
      { reply_markup: vaMenuKeyboard() }
    );
    return;
  }

  const lines = accounts.map((account) => {
    const handle = account.handle ? ` - ${account.handle}` : '';
    return `${account.name || account.slug}${handle}`;
  });

  await bot.sendMessage(chatId, `Comptes assignes:\n${lines.join('\n')}`, {
    reply_markup: vaMenuKeyboard()
  });
}

async function handlePostedConfirmation(bot, query) {
  const chatId = query.message.chat.id;
  const task = await markPostPosted(query.data.replace('posted:', ''), query.from || {});

  await bot.editMessageReplyMarkup({
    inline_keyboard: [[{ text: '✅ Post confirmé', callback_data: 'posted_done' }]]
  }, {
    chat_id: chatId,
    message_id: query.message.message_id
  }).catch(() => {});

  const jobs = await listDailyJobs();
  const nextJob = jobs.find((job) => (
    job.enabled !== false
    && job.account_slug === task.account_slug
    && (!job.telegram_chat_id || String(job.telegram_chat_id) === String(chatId))
  ));
  await bot.sendMessage(chatId, [
    `✅ Publication confirmée pour ${task.account_name || task.account_slug}.`,
    nextJob ? `📅 Prochain post prévu demain à ${nextJob.time || '09:00'}.` : '📅 Aucun prochain post planifié pour ce compte.'
  ].join('\n'), { reply_markup: vaMenuKeyboard() });
}

async function processTelegramOutbox(bot) {
  const items = await claimPendingTelegramOutbox({ limit: 2 });
  for (const item of items) {
    try {
      if (!item.account_slug || !item.template_path || !item.chat_id) {
        throw new Error('Demande incomplete: account_slug, template_path et chat_id sont obligatoires.');
      }
      const account = await getAccount(item.account_slug);
      if (!account) throw new Error(`Compte introuvable: ${item.account_slug}`);
      if (!(await isChatAssignedToAccount(item.chat_id, item.account_slug))) {
        throw new Error(`Ce VA n'est pas assigne au compte ${item.account_slug}.`);
      }
      const baseTemplate = normalizeTemplate(await loadStoredTemplateAsync(item.template_path));
      const template = item.use_gemini
        ? await templateWithGemini({ topic: item.topic || baseTemplate.cover_title, baseTemplate, account })
        : baseTemplate;
      const result = await generateForAccounts(template, { accountSlugs: [item.account_slug] });
      for (const generated of result.results || []) {
        await sendCarouselSlidesToChat(bot, item.chat_id, generated, {
          templatePath: item.template_path,
          topic: item.topic
        });
      }
      await updateTelegramOutboxItem(item.id, {
        status: 'done',
        finished_at: new Date().toISOString(),
        result: {
          run_id: result.run_id,
          accounts: result.results?.map((entry) => entry.account_slug) || []
        }
      });
    } catch (error) {
      await updateTelegramOutboxItem(item.id, {
        status: 'error',
        finished_at: new Date().toISOString(),
        error: error.message
      });
    }
  }
}

function startTelegramOutboxWorker(bot) {
  const tick = () => {
    processTelegramOutbox(bot).catch((error) => {
      console.error(`Telegram outbox error: ${error.message}`);
    });
  };
  setInterval(tick, Number(process.env.TELEGRAM_OUTBOX_INTERVAL_MS || 10000));
  tick();
}

export function setupTelegramHandlers(bot, { startScheduler = true } = {}) {
  if (startScheduler) startDailyScheduler({ bot });
  startTelegramOutboxWorker(bot);

  bot.on('message', async (msg) => {
    if (!isTelegramAuthEnabled()) return;
    if (await isAuthorizedChat(msg.chat.id)) return;
    if (String(msg.text || '').trim() === telegramPassword()) {
      await authorizeChat(msg.chat);
      await bot.sendMessage(msg.chat.id, welcomeText(), { reply_markup: vaMenuKeyboard() });
    }
  });

  bot.onText(/\/start|\/menu/, async (msg) => {
    if (!(await requireAuth(bot, msg))) return;
    await bot.sendMessage(msg.chat.id, welcomeText(), { reply_markup: vaMenuKeyboard() });
  });

  bot.onText(/\/help|\/aide/, async (msg) => {
    if (!(await requireAuth(bot, msg))) return;
    await bot.sendMessage(msg.chat.id, helpText(), { reply_markup: vaMenuKeyboard() });
  });

  bot.onText(/\/my_accounts|\/mes_comptes|\/comptes/, async (msg) => {
    if (!(await requireAuth(bot, msg))) return;
    await showMyAccounts(bot, msg.chat.id);
  });

  bot.onText(/\/logout/, async (msg) => {
    await revokeChat(msg.chat.id);
    await bot.sendMessage(msg.chat.id, 'Chat deconnecte.');
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message?.chat?.id;
    const data = query.data || '';
    await bot.answerCallbackQuery(query.id).catch(() => {});
    if (!chatId) return;
    if (!(await requireAuth(bot, query))) return;

    try {
      if (data === 'my_accounts') {
        await showMyAccounts(bot, chatId);
      } else if (data === 'help') {
        await bot.sendMessage(chatId, helpText(), { reply_markup: vaMenuKeyboard() });
      } else if (data.startsWith('posted:')) {
        await handlePostedConfirmation(bot, query);
      } else if (data === 'posted_done') {
        await bot.answerCallbackQuery(query.id, { text: 'Deja confirme.' }).catch(() => {});
      } else {
        await bot.sendMessage(chatId, 'Action inconnue. Utilise /start pour ouvrir le menu VA.');
      }
    } catch (error) {
      await bot.sendMessage(chatId, `Erreur: ${error.message}`);
    }
  });

  return bot;
}

export function startTelegramBot() {
  if (!token || token === 'your_bot_token') {
    throw new Error('TELEGRAM_BOT_TOKEN est manquant dans .env');
  }

  const bot = new TelegramBot(token, { polling: true });
  return setupTelegramHandlers(bot, { startScheduler: true });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startTelegramBot();
}
