const state = {
  accounts: [],
  chats: [],
  templates: [],
  jobs: [],
  posts: [],
  outbox: [],
  gemini: {},
  previewTemplatePath: ''
};

const errorBox = document.querySelector('#ops-error');
const geminiStatus = document.querySelector('#gemini-status');

function setError(message = '') {
  errorBox.textContent = message;
  errorBox.hidden = !message;
  errorBox.dataset.kind = message && /^(Compte|VA|Template|Daily|Demande|Carousel)/.test(message) ? 'success' : 'error';
}

function option(label, value) {
  const node = document.createElement('option');
  node.textContent = label;
  node.value = value;
  return node;
}

function chatLabel(chat) {
  return chat.username
    ? `@${chat.username}`
    : [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || chat.id;
}

function templateLabel(template) {
  return `${template.account_slug}/${template.name}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stripMarks(value) {
  return String(value || '')
    .replace(/\[\[([\s\S]+?)\]\]/g, (_, content) => content.includes('|') ? content.split('|').slice(1).join('|') : content)
    .replace(/__([\s\S]+?)__/g, (_, content) => content.includes('|') ? content.split('|').slice(1).join('|') : content);
}

function fillSelect(select, items, labelFn, valueFn, emptyLabel = 'Aucun') {
  select.replaceChildren();
  if (!items.length) {
    select.appendChild(option(emptyLabel, ''));
    return;
  }
  for (const item of items) select.appendChild(option(labelFn(item), valueFn(item)));
}

function selectedValues(select) {
  return [...select.selectedOptions].map((item) => item.value).filter(Boolean);
}

function chatsForAccountSlug(accountSlug) {
  return state.chats.filter((chat) => (chat.account_slugs || []).includes(accountSlug));
}

function syncAssignedAccountSelection() {
  const chatId = document.querySelector('#va-select')?.value;
  const chat = state.chats.find((item) => String(item.id) === String(chatId));
  const assigned = new Set(chat?.account_slugs || []);
  for (const optionNode of document.querySelector('#assign-accounts').options) {
    optionNode.selected = assigned.has(optionNode.value);
  }
}

function syncRecipientSelects() {
  const generateAccount = document.querySelector('#generate-account')?.value || '';
  const dailyAccount = document.querySelector('#daily-account')?.value || '';
  fillSelect(document.querySelector('#generate-chat'), chatsForAccountSlug(generateAccount), chatLabel, (chat) => chat.id, 'Aucun VA attribue a ce compte');
  fillSelect(document.querySelector('#daily-chat'), chatsForAccountSlug(dailyAccount), chatLabel, (chat) => chat.id, 'Aucun VA attribue a ce compte');
}

function formatDate(value) {
  if (!value) return 'Jamais';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function renderGemini() {
  geminiStatus.textContent = state.gemini?.configured
    ? `${state.gemini.model} (${state.gemini.source})`
    : 'Non configure';
  const modeSelect = document.querySelector('#ops-gemini-mode-form select[name="gemini_mode"]');
  if (modeSelect) modeSelect.value = state.gemini?.mode || 'auto';
}

function renderMetrics() {
  document.querySelector('#metric-accounts').textContent = state.accounts.length;
  document.querySelector('#metric-va').textContent = state.chats.length;
  document.querySelector('#metric-jobs').textContent = state.jobs.length;
  document.querySelector('#metric-posts').textContent = state.posts.length;
  document.querySelector('#ops-status-title').textContent = state.jobs.length ? 'Automation prete' : 'Configure les daily jobs';
  document.querySelector('#ops-status-copy').textContent = state.chats.length
    ? 'Les VA autorises peuvent recevoir les carousels et confirmer la publication.'
    : 'Demande aux VA d envoyer le mot de passe au bot pour apparaitre ici.';
}

function renderForms() {
  const templateSelects = ['#generate-template', '#daily-template'].map((selector) => document.querySelector(selector));
  for (const select of templateSelects) fillSelect(select, state.templates, templateLabel, (item) => item.path, 'Cree d abord un template');
  if (state.previewTemplatePath && state.templates.some((template) => template.path === state.previewTemplatePath)) {
    for (const select of templateSelects) {
      if ([...select.options].some((item) => item.value === state.previewTemplatePath)) select.value = state.previewTemplatePath;
    }
  } else {
    state.previewTemplatePath = document.querySelector('#generate-template')?.value || document.querySelector('#daily-template')?.value || '';
  }

  fillSelect(document.querySelector('#va-select'), state.chats, chatLabel, (chat) => chat.id, 'Aucun VA autorise');
  fillSelect(document.querySelector('#generate-account'), state.accounts, (account) => `${account.slug} ${account.handle || ''}`, (account) => account.slug, 'Aucun compte');
  fillSelect(document.querySelector('#daily-account'), state.accounts, (account) => `${account.slug} ${account.handle || ''}`, (account) => account.slug, 'Aucun compte');
  fillSelect(document.querySelector('#template-account'), [{ slug: 'global', handle: '' }, ...state.accounts], (account) => `${account.slug} ${account.handle || ''}`, (account) => account.slug, 'Global');
  fillSelect(document.querySelector('#assign-accounts'), state.accounts, (account) => `${account.slug} ${account.handle || ''}`, (account) => account.slug, 'Aucun compte');
  syncAssignedAccountSelection();
  syncRecipientSelects();
}

function renderJobs() {
  const list = document.querySelector('#jobs-list');
  if (!state.jobs.length) {
    list.innerHTML = '<p class="ops-empty">Aucun job quotidien. Enregistre un compte puis attribue-le a un VA.</p>';
    return;
  }
  list.replaceChildren(...state.jobs.map((job) => {
    const row = document.createElement('div');
    row.className = 'ops-row';
    row.innerHTML = `
      <div>
        <strong>${job.account_slug || 'tous comptes'}</strong>
        <span>${job.time || '09:00'} · ${job.topic || 'theme libre'} · ${job.use_gemini ? 'Gemini' : 'Template fixe'} · ${job.last_status || 'idle'}</span>
      </div>
      <button class="ghost-button small-action" data-delete-job="${job.id}">Supprimer</button>
    `;
    return row;
  }));
}

function renderVaList() {
  const list = document.querySelector('#va-list');
  if (!state.chats.length) {
    list.innerHTML = '<p class="ops-empty">Aucun VA connecte. Envoie le mot de passe au bot Telegram, puis recharge cette page.</p>';
    return;
  }
  list.replaceChildren(...state.chats.map((chat) => {
    const assigned = chat.account_slugs || [];
    const postedCount = state.posts.filter((post) => String(post.chat_id) === String(chat.id) && post.status === 'posted').length;
    const sentCount = state.posts.filter((post) => String(post.chat_id) === String(chat.id)).length;
    const card = document.createElement('article');
    card.className = 'va-card';
    card.innerHTML = `
      <div>
        <strong>${chatLabel(chat)}</strong>
        <span>${assigned.length ? assigned.join(', ') : 'Aucun compte attribue'}</span>
      </div>
      <div class="va-stats">
        <span><b>${postedCount}</b> postes</span>
        <span><b>${sentCount}</b> envoyes</span>
      </div>
    `;
    return card;
  }));
}

function renderPosts() {
  const list = document.querySelector('#posts-list');
  const pending = (state.outbox || []).filter((item) => ['pending', 'running', 'error'].includes(item.status)).slice(0, 10);
  if (!state.posts.length && !pending.length) {
    list.innerHTML = '<p class="ops-empty">Aucun post envoye pour le moment.</p>';
    return;
  }
  const outboxRows = pending.map((item) => {
    const row = document.createElement('div');
    row.className = `ops-row ${item.status === 'error' ? 'is-error' : ''}`;
    row.innerHTML = `
      <div>
        <strong>${item.account_slug}</strong>
        <span>${item.status === 'error' ? 'Erreur file bot' : 'En attente bot'} · ${formatDate(item.created_at)} · ${item.error || item.chat_id}</span>
      </div>
      <span class="muted">${item.status}</span>
    `;
    return row;
  });
  const postRows = state.posts.slice(0, 30).map((post) => {
    const row = document.createElement('div');
    row.className = `ops-row ${post.status === 'posted' ? 'is-posted' : ''}`;
    row.innerHTML = `
      <div>
        <strong>${post.account_slug}</strong>
        <span>${post.status === 'posted' ? 'Poste' : 'Envoye'} · ${formatDate(post.posted_at || post.sent_at)} · ${post.posted_by || post.chat_id}</span>
      </div>
      ${post.slide_urls?.length ? `<span class="muted">${post.slide_urls.length} PNG</span>` : (post.download_url ? `<a class="download-link" href="${post.download_url}">Archive</a>` : '<span class="muted">PNG local</span>')}
    `;
    return row;
  });
  list.replaceChildren(...outboxRows, ...postRows);
}

async function renderTemplatePreview() {
  const preview = document.querySelector('#template-preview');
  if (!preview) return;
  const selectedPath = state.previewTemplatePath
    || document.querySelector('#generate-template')?.value
    || document.querySelector('#daily-template')?.value
    || '';
  if (!selectedPath) {
    preview.innerHTML = '<p class="ops-empty">Selectionne un template pour voir sa DA et son premier ecran.</p>';
    return;
  }
  preview.innerHTML = '<p class="ops-empty">Chargement de l apercu...</p>';
  try {
    const response = await fetch(`/api/admin/templates/resolve?path=${encodeURIComponent(selectedPath)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Apercu impossible.');
    const template = data.template || {};
    const da = template.da || {};
    const slidesTotal = (Array.isArray(template.slides) ? template.slides.length : 0) + 2;
    preview.innerHTML = `
      <div class="template-preview-stage" style="--preview-bg:${escapeHtml(da.background_color || '#7A9BAD')};--preview-text:${escapeHtml(da.text_color || '#FFFFFF')};--preview-accent:${escapeHtml(da.annotation_color || '#344146')};">
        <div class="preview-drips"></div>
        <p>${escapeHtml(stripMarks(template.cover_title || 'Template'))}</p>
        <span>${escapeHtml(template.account_handle_override || 'handle du compte')}</span>
      </div>
      <div class="template-preview-meta">
        <strong>${escapeHtml(data.name || 'template')}</strong>
        <span>${slidesTotal} slides · ${escapeHtml(da.background_color || '#7A9BAD')} · ${escapeHtml(da.font_family || 'font par defaut')}</span>
        <span>CTA: ${escapeHtml(stripMarks(template.cta_text || ''))}</span>
      </div>
    `;
  } catch (error) {
    preview.innerHTML = `<p class="ops-empty">${escapeHtml(error.message)}</p>`;
  }
}

async function loadState() {
  const response = await fetch('/api/admin/state');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Chargement impossible.');
  Object.assign(state, data);
  renderGemini();
  renderMetrics();
  renderForms();
  renderJobs();
  renderPosts();
  renderVaList();
  await renderTemplatePreview();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Operation impossible.');
  return data;
}

document.querySelector('#ops-gemini-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const form = event.currentTarget;
    state.gemini = await postJson('/api/gemini/login', {
      api_key: form.elements.gemini_api_key.value.trim(),
      model: form.elements.gemini_model.value.trim() || 'gemini-2.5-flash'
    });
    form.elements.gemini_api_key.value = '';
    renderGemini();
    setError('');
  } catch (error) {
    setError(error.message);
  }
});

document.querySelector('#gemini-logout').addEventListener('click', async () => {
  state.gemini = await postJson('/api/gemini/logout', {});
  renderGemini();
});

document.querySelector('#ops-gemini-mode-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const form = event.currentTarget;
    state.gemini = await postJson('/api/gemini/mode', {
      mode: form.elements.gemini_mode.value,
      enable_cli: form.elements.gemini_mode.value === 'cli'
    });
    renderGemini();
    setError('Mode Gemini enregistre.');
  } catch (error) {
    setError(error.message);
  }
});

document.querySelector('#account-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const form = event.currentTarget;
    await postJson('/api/admin/accounts', {
      slug: form.elements.slug.value.trim(),
      name: form.elements.name.value.trim(),
      handle: form.elements.handle.value.trim(),
      language: form.elements.language.value.trim(),
      cta_type: form.elements.cta_type.value,
      cta_keyword: form.elements.cta_keyword.value.trim(),
      cta_offer: form.elements.cta_offer.value.trim(),
      cta_instruction: form.elements.cta_instruction.value.trim()
    });
    event.currentTarget.reset();
    await loadState();
    setError('Compte enregistre. Tu peux maintenant l attribuer a un VA.');
  } catch (error) {
    setError(error.message);
  }
});

document.querySelector('#template-upload-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const form = event.currentTarget;
    const file = form.elements.template_file.files?.[0];
    if (!file) throw new Error('Choisis un fichier .template.');
    const template = JSON.parse(await file.text());
    await postJson('/api/admin/templates', {
      account_slug: form.elements.account_slug.value || 'global',
      template_name: form.elements.template_name.value.trim() || file.name.replace(/\.template$/i, ''),
      template
    });
    form.reset();
    await loadState();
    setError('Template importe.');
  } catch (error) {
    setError(error.message);
  }
});

document.querySelector('#daily-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const form = event.currentTarget;
    await postJson('/api/admin/daily', {
      account_slug: form.elements.account_slug.value,
      template_path: form.elements.template_path.value,
      time: form.elements.time.value || '09:00',
      topic: form.elements.topic.value.trim(),
      use_gemini: form.elements.use_gemini.checked,
      send_telegram: true,
      telegram_chat_id: form.elements.chat_id.value
    });
    await loadState();
    setError('Daily cree.');
  } catch (error) {
    setError(error.message);
  }
});

document.querySelector('#assign-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const form = event.currentTarget;
    await postJson('/api/admin/assign', {
      chat_id: form.elements.chat_id.value,
      account_slugs: selectedValues(form.elements.account_slugs)
    });
    await loadState();
    setError('VA attribue.');
  } catch (error) {
    setError(error.message);
  }
});

document.querySelector('#va-select').addEventListener('change', syncAssignedAccountSelection);
document.querySelector('#generate-account').addEventListener('change', syncRecipientSelects);
document.querySelector('#daily-account').addEventListener('change', syncRecipientSelects);
document.querySelector('#generate-template').addEventListener('change', (event) => {
  state.previewTemplatePath = event.currentTarget.value;
  renderTemplatePreview();
});
document.querySelector('#daily-template').addEventListener('change', (event) => {
  state.previewTemplatePath = event.currentTarget.value;
  renderTemplatePreview();
});

document.querySelector('#generate-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  button.textContent = 'Generation...';
  try {
    const form = event.currentTarget;
    const result = await postJson('/api/admin/generate-send', {
      account_slug: form.elements.account_slug.value,
      template_path: form.elements.template_path.value,
      chat_id: form.elements.chat_id.value,
      topic: form.elements.topic.value.trim(),
      use_gemini: form.elements.use_gemini.checked
    });
    await loadState();
    setError(result.queued ? result.message : 'Carousel genere et envoye au VA.');
  } catch (error) {
    setError(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Generer et envoyer';
  }
});

document.addEventListener('click', async (event) => {
  const id = event.target?.dataset?.deleteJob;
  if (!id) return;
  await fetch(`/api/admin/daily/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await loadState();
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  window.location.href = '/login';
});

loadState().catch((error) => setError(error.message));
