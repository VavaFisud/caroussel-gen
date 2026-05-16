import { createPostTask } from './post-tracking.js';

function slideTargets(item = {}) {
  const urls = Array.isArray(item.slide_urls) ? item.slide_urls.filter(Boolean) : [];
  const paths = Array.isArray(item.slide_paths) ? item.slide_paths.filter(Boolean) : [];
  return urls.length ? urls : paths;
}

export async function sendCarouselSlidesToChat(bot, chatId, item, {
  templatePath = '',
  topic = '',
  intro = ''
} = {}) {
  const slides = slideTargets(item);
  if (slides.length === 0) {
    throw new Error('Aucune slide PNG disponible pour cet envoi.');
  }

  const task = await createPostTask({
    account_slug: item.account_slug,
    account_name: item.account_name,
    chat_id: chatId,
    template_path: templatePath,
    topic,
    carousel_id: item.id || null,
    download_url: item.download_url || item.zip_url || '',
    zip_path: item.zip_path || '',
    slide_urls: item.slide_urls || [],
    slide_paths: item.slide_paths || []
  });

  await bot.sendMessage(chatId, [
    intro || `📌 Nouveau carousel pour ${item.account_name || item.account_slug}`,
    `🖼️ ${slides.length} slides PNG à poster dans l'ordre.`,
    "Quand le post est publié, confirme avec le bouton sous les images."
  ].join('\n'));

  for (let index = 0; index < slides.length; index += 1) {
    await bot.sendDocument(chatId, slides[index], {
      caption: `Slide ${index + 1}/${slides.length}`
    });
  }

  const message = await bot.sendMessage(chatId, 'Publication terminee sur Instagram ?', {
    reply_markup: {
      inline_keyboard: [[{ text: "✅ J'ai posté", callback_data: `posted:${task.id}` }]]
    }
  });

  task.telegram_message_id = message.message_id;
  return task;
}
