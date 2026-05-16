const form = document.querySelector('#carousel-form');
const slidesList = document.querySelector('#slides-list');
const slideTemplate = document.querySelector('#slide-template');
const formError = document.querySelector('#form-error');
const submitButton = document.querySelector('#submit-button');
const historyBody = document.querySelector('#history-body');
const emptyState = document.querySelector('#empty-state');
const loadingState = document.querySelector('#loading-state');
const lastGeneration = document.querySelector('#last-generation');
const previewStage = document.querySelector('#preview-stage');
const previewCount = document.querySelector('#preview-count');
const geminiForm = document.querySelector('#gemini-form');
const geminiStatus = document.querySelector('#gemini-status');
const geminiLogout = document.querySelector('#gemini-logout');
const annotationField = document.querySelector('#annotation-field');
const annotationStyle = document.querySelector('#annotation-style');
const annotationTarget = document.querySelector('#annotation-target');
const annotationBuilderColor = document.querySelector('#annotation-builder-color');
const annotationStroke = document.querySelector('#annotation-stroke');
const annotationRotation = document.querySelector('#annotation-rotation');
const annotationOpacity = document.querySelector('#annotation-opacity');
const annotationFontSize = document.querySelector('#annotation-font-size');
const elementSummary = document.querySelector('#element-summary');

let previewIndex = 0;

const fontPresets = {
  playfair: {
    font_family: "'Playfair Display', Georgia, serif",
    font_body: "'DM Sans', Arial, sans-serif",
    google_fonts_url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@300;400;500&display=swap'
  },
  cormorant: {
    font_family: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
    font_body: "'DM Sans', Arial, sans-serif",
    google_fonts_url: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500&display=swap'
  },
  lora: {
    font_family: "'Lora', Georgia, serif",
    font_body: "'DM Sans', Arial, sans-serif",
    google_fonts_url: 'https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&family=DM+Sans:wght@300;400;500&display=swap'
  },
  fraunces: {
    font_family: "'Fraunces', Georgia, serif",
    font_body: "'DM Sans', Arial, sans-serif",
    google_fonts_url: 'https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=DM+Sans:wght@300;400;500&display=swap'
  }
};

const example = {
  cover_title: 'Sommeil de bebe',
  cover_subtitle: '3 reperes simples pour des nuits plus calmes',
  cover_image_url: '',
  cover_image_position: 'center',
  account_handle_override: '@beatrice.bebe',
  image_fit: 'cover',
  da: {
    background_color: '#7A9BAD',
    cta_background_color: '#7A9BAD',
    accent_color: '#4A6270',
    text_color: '#FFFFFF',
    handle_color: 'rgba(255,255,255,0.75)',
    badge_bg: '#4A6270',
    annotation_color: '#3D2B1F',
    decoration_color: 'rgba(157,189,202,0.45)',
    arrow_color: '#FFFFFF',
    bullet_icon: '✦',
    title_font_size: '72px',
    subtitle_font_size: '42px',
    body_font_size: '72px',
    content_title_font_size: '52px',
    handle_font_size: '30px',
    font_size_main: '72px',
    line_height: '1.28',
    ...fontPresets.cormorant
  },
  slides: [
    {
      title: 'Un rythme lisible',
      body: 'Garde des heures de lever et de coucher proches chaque jour.',
      image_url: '',
      image_position: 'center'
    },
    {
      title: 'Un rituel court',
      body: 'Bain, pyjama, histoire, calin.\nToujours dans le meme ordre.',
      image_url: '',
      image_position: 'center'
    },
    {
      title: 'Une chambre apaisee',
      body: 'Lumiere douce, temperature stable, bruit limite.',
      image_url: '',
      image_position: 'center'
    }
  ],
  cta_text: 'Lis le guide complet',
  cta_sub: "L'ebook sommeil bebe est dans la bio",
  cta_image_url: '',
  cta_image_position: 'center',
  cover_elements: [],
  cover_marks: [],
  cta_elements: [],
  cta_marks: [],
  decorative_elements: [
    { type: 'arrow', x: 50, y: 86, width: 160, height: 32, color: '#FFFFFF', stroke: 4, opacity: 0.9, rotation: 0 }
  ]
};

function readJsonArrayField(field, fallback = []) {
  const raw = field?.value?.trim() || '';
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonArrayField(field, value = []) {
  field.value = JSON.stringify(Array.isArray(value) ? value : [], null, 2);
}

function slugToken(value) {
  return String(value || 'mark')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36) || 'mark';
}

function currentSlideCard() {
  const cards = [...slidesList.querySelectorAll('.slide-card')];
  if (cards.length === 0) return null;
  const contentIndex = previewIndex - 1;
  return cards[Math.min(Math.max(contentIndex, 0), cards.length - 1)];
}

function setError(message) {
  formError.textContent = message;
  formError.hidden = !message;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function bindImageUpload(fileInput, urlInput) {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    setError('Le fichier selectionne doit etre une image.');
    return;
  }
  const dataUrl = await fileToDataUrl(file);
  const response = await fetch('/api/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name || 'image.png',
      mimeType: file.type || 'image/png',
      dataUrl
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Upload image impossible.');
  }
  urlInput.value = data.url;
  setError('');
  updatePreview();
}

function renumberSlides() {
  [...slidesList.querySelectorAll('.slide-card')].forEach((card, index) => {
    card.querySelector('.slide-index').textContent = `Slide ${index + 1}`;
    card.querySelector('.remove-slide').disabled = slidesList.children.length <= 1;
  });
}

function addSlide(slide = {}) {
  const fragment = slideTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.slide-card');
  const imageUrl = card.querySelector('[data-slide-image-url]');
  const imageFile = card.querySelector('[data-slide-image-file]');

  card.querySelector('[data-slide-title]').value = slide.title || '';
  card.querySelector('[data-slide-body]').value = slide.body || '';
  imageUrl.value = slide.image_url || '';
  card.querySelector('[data-slide-image-position]').value = slide.image_position || 'center';
  writeJsonArrayField(card.querySelector('[data-slide-image-frame]'), slide.image_frame ? [slide.image_frame] : []);
  writeJsonArrayField(card.querySelector('[data-slide-elements]'), slide.elements || []);
  writeJsonArrayField(card.querySelector('[data-slide-marks]'), slide.marks || []);

  imageFile.addEventListener('change', async () => {
    try {
      await bindImageUpload(imageFile, imageUrl);
    } catch (error) {
      setError(error.message);
    }
  });
  card.querySelector('.remove-slide').addEventListener('click', () => {
    card.remove();
    previewIndex = Math.min(previewIndex, Math.max(getPreviewSlides(readPayload()).length - 1, 0));
    renumberSlides();
    updatePreview();
  });

  slidesList.appendChild(fragment);
  renumberSlides();
  updatePreview();
}

function detectFontPreset(da = {}) {
  return Object.entries(fontPresets).find(([, preset]) => preset.font_family === da.font_family)?.[0] || 'playfair';
}

function fillForm(data) {
  const da = data.da || {};
  form.elements.cover_title.value = data.cover_title || '';
  form.elements.cover_subtitle.value = data.cover_subtitle || '';
  form.elements.cover_image_url.value = data.cover_image_url || '';
  form.elements.cover_image_position.value = data.cover_image_position || 'center';
  writeJsonArrayField(form.elements.cover_image_frame, data.cover_image_frame ? [data.cover_image_frame] : []);
  form.elements.cta_text.value = data.cta_text || '';
  form.elements.cta_sub.value = data.cta_sub || '';
  form.elements.cta_image_url.value = data.cta_image_url || '';
  form.elements.cta_image_position.value = data.cta_image_position || 'center';
  writeJsonArrayField(form.elements.cta_image_frame, data.cta_image_frame ? [data.cta_image_frame] : []);
  form.elements.account_handle_override.value = data.account_handle_override || '';
  form.elements.image_fit.value = data.image_fit || 'cover';
  form.elements.background_color.value = da.background_color || '#7A9BAD';
  form.elements.cta_background_color.value = da.cta_background_color || '#7A9BAD';
  form.elements.accent_color.value = da.accent_color || '#4A6270';
  form.elements.annotation_color.value = da.annotation_color || '#3D2B1F';
  annotationBuilderColor.value = da.annotation_color || '#3D2B1F';
  form.elements.text_color.value = da.text_color || '#FFFFFF';
  form.elements.bullet_icon.value = da.bullet_icon || '✦';
  form.elements.title_font_size.value = parseInt(da.title_font_size || da.font_size_main || '72', 10);
  form.elements.subtitle_font_size.value = parseInt(da.subtitle_font_size || '42', 10);
  form.elements.body_font_size.value = parseInt(da.body_font_size || da.font_size_main || '72', 10);
  form.elements.handle_font_size.value = parseInt(da.handle_font_size || '30', 10);
  form.elements.decorative_elements.value = JSON.stringify(data.decorative_elements || [], null, 2);
  writeJsonArrayField(form.elements.cover_elements, data.cover_elements || []);
  writeJsonArrayField(form.elements.cover_marks, data.cover_marks || []);
  writeJsonArrayField(form.elements.cta_elements, data.cta_elements || []);
  writeJsonArrayField(form.elements.cta_marks, data.cta_marks || []);
  form.elements.font_preset.value = detectFontPreset(da);
  slidesList.innerHTML = '';
  (data.slides || []).forEach(addSlide);
  if (slidesList.children.length === 0) addSlide();
  previewIndex = 0;
  setError('');
  updatePreview();
}

function selectedDa() {
  const preset = fontPresets[form.elements.font_preset.value] || fontPresets.playfair;
  return {
    background_color: form.elements.background_color.value,
    cta_background_color: form.elements.cta_background_color.value,
    accent_color: form.elements.accent_color.value,
    text_color: form.elements.text_color.value,
    handle_color: 'rgba(255,255,255,0.75)',
    badge_bg: form.elements.accent_color.value,
    annotation_color: form.elements.annotation_color.value,
    decoration_color: 'rgba(157,189,202,0.45)',
    arrow_color: '#FFFFFF',
    bullet_icon: form.elements.bullet_icon.value || '✦',
    title_font_size: `${form.elements.title_font_size.value || 72}px`,
    subtitle_font_size: `${form.elements.subtitle_font_size.value || 42}px`,
    body_font_size: `${form.elements.body_font_size.value || 72}px`,
    content_title_font_size: `${Math.max(34, Math.round(Number(form.elements.body_font_size.value || 72) * 0.72))}px`,
    handle_font_size: `${form.elements.handle_font_size.value || 30}px`,
    font_size_main: `${form.elements.title_font_size.value || 72}px`,
    line_height: '1.28',
    ...preset
  };
}

function readDecorativeElements() {
  return readJsonArrayField(form.elements.decorative_elements);
}

function readPayload() {
  const slides = [...slidesList.querySelectorAll('.slide-card')].map((card) => ({
    title: card.querySelector('[data-slide-title]').value.trim(),
    body: card.querySelector('[data-slide-body]').value.trim(),
	    image_url: card.querySelector('[data-slide-image-url]').value.trim(),
	    image_position: card.querySelector('[data-slide-image-position]').value,
	    image_frame: readJsonArrayField(card.querySelector('[data-slide-image-frame]'))[0] || null,
	    elements: readJsonArrayField(card.querySelector('[data-slide-elements]')),
    marks: readJsonArrayField(card.querySelector('[data-slide-marks]'))
  })).filter((slide) => slide.title || slide.body || slide.image_url);

  return {
    cover_title: form.elements.cover_title.value.trim(),
    cover_subtitle: form.elements.cover_subtitle.value.trim(),
    cover_image_url: form.elements.cover_image_url.value.trim(),
    cover_image_position: form.elements.cover_image_position.value,
    cover_image_frame: readJsonArrayField(form.elements.cover_image_frame)[0] || null,
    slides,
    cta_text: form.elements.cta_text.value.trim(),
    cta_sub: form.elements.cta_sub.value.trim(),
    cta_image_url: form.elements.cta_image_url.value.trim(),
    cta_image_position: form.elements.cta_image_position.value,
    cta_image_frame: readJsonArrayField(form.elements.cta_image_frame)[0] || null,
    account_handle_override: form.elements.account_handle_override.value.trim(),
    image_fit: form.elements.image_fit.value,
    da: selectedDa(),
    cover_elements: readJsonArrayField(form.elements.cover_elements),
    cover_marks: readJsonArrayField(form.elements.cover_marks),
    cta_elements: readJsonArrayField(form.elements.cta_elements),
    cta_marks: readJsonArrayField(form.elements.cta_marks),
    decorative_elements: readDecorativeElements()
  };
}

function validatePayload(payload) {
  if (!payload.cover_title) return 'Cover Title est obligatoire.';
  if (!payload.cover_subtitle) return 'Cover Subtitle est obligatoire.';
  if (payload.slides.length === 0) return 'Ajoute au moins une slide.';
  if (payload.slides.some((slide) => !slide.body && !slide.image_url)) return 'Chaque slide doit avoir un corps ou une image.';
  if (!payload.cta_text) return 'CTA Text est obligatoire.';
  if (!payload.cta_sub) return 'CTA Sub est obligatoire.';
  return '';
}

function validateDecorativeElements() {
  const fields = [
    [form.elements.decorative_elements, 'Elements globaux'],
    [form.elements.cover_elements, 'Cover elements'],
    [form.elements.cover_marks, 'Cover marks'],
    [form.elements.cta_elements, 'CTA elements'],
    [form.elements.cta_marks, 'CTA marks'],
    ...[...slidesList.querySelectorAll('.slide-card')].flatMap((card, index) => [
      [card.querySelector('[data-slide-elements]'), `Slide ${index + 1} elements`],
      [card.querySelector('[data-slide-marks]'), `Slide ${index + 1} marks`]
    ])
  ];

  for (const [field, label] of fields) {
    const raw = field?.value?.trim() || '';
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return `${label} doit etre un tableau JSON.`;
    } catch (error) {
      return `${label} JSON invalide: ${error.message}`;
    }
  }
  return '';
}

function formatDate(value) {
  if (!value) return 'Jamais';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function getPreviewSlides(payload) {
  return [
    { type: 'cover', title: payload.cover_title, subtitle: payload.cover_subtitle, image_url: payload.cover_image_url, image_position: payload.cover_image_position, image_frame: payload.cover_image_frame, elements: payload.cover_elements, marks: payload.cover_marks },
    ...payload.slides.map((slide) => ({ type: 'content', ...slide })),
    { type: 'cta', title: payload.cta_text, subtitle: payload.cta_sub, image_url: payload.cta_image_url, image_position: payload.cta_image_position, image_frame: payload.cta_image_frame, elements: payload.cta_elements, marks: payload.cta_marks }
  ];
}

function appendText(parent, tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text || '';
  parent.appendChild(node);
  return node;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function cssColor(value, fallback = '#3D2B1F') {
  return /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? value : fallback;
}

function normalizeMarkKind(mark = {}) {
  const kind = String(mark.kind || mark.type || mark.style || 'circle').toLowerCase();
  if (kind === 'handdrawnunderline') return 'underline';
  if (kind === 'handdrawncircle' || kind === 'ellipse') return 'circle';
  return kind === 'underline' ? 'underline' : 'circle';
}

function markStyle(mark = {}) {
  const parts = [
    `--mark-color:${cssColor(mark.color, '#3D2B1F')}`,
    `--mark-stroke:${Number(mark.strokeWidth ?? mark.stroke_width ?? mark.stroke ?? 4) || 4}px`,
    `--mark-rotation:${Number(mark.rotation ?? (normalizeMarkKind(mark) === 'underline' ? -2 : -3)) || 0}deg`,
    `--mark-opacity:${Number(mark.opacity ?? 1) || 1}`
  ];
  const fontSize = Number(mark.fontSize ?? mark.font_size);
  if (fontSize > 0) parts.push(`font-size:${fontSize}px`);
  return parts.join(';');
}

function parseLegacyMarkedText(value) {
  const text = String(value || '');
  const parts = [];
  let index = 0;
  while (index < text.length) {
    const circleIndex = text.indexOf('[[', index);
    const underlineIndex = text.indexOf('__', index);
    const candidates = [circleIndex, underlineIndex].filter((position) => position >= 0);
    const nextIndex = candidates.length ? Math.min(...candidates) : -1;
    if (nextIndex < 0) {
      parts.push({ text: text.slice(index) });
      break;
    }
    if (nextIndex > index) parts.push({ text: text.slice(index, nextIndex) });
    const isCircle = text.startsWith('[[', nextIndex);
    const open = isCircle ? '[[' : '__';
    const close = isCircle ? ']]' : '__';
    const endIndex = text.indexOf(close, nextIndex + open.length);
    if (endIndex < 0) {
      parts.push({ text: text.slice(nextIndex) });
      break;
    }
    const content = text.slice(nextIndex + open.length, endIndex);
    const separator = content.indexOf('|');
    parts.push({
      text: separator > 0 ? content.slice(separator + 1) : content,
      mark: {
        kind: isCircle ? 'circle' : 'underline',
        token: separator > 0 ? content.slice(0, separator).trim() : ''
      }
    });
    index = endIndex + close.length;
  }
  return parts;
}

function applyStructuredMarks(parts, marks = []) {
  return (marks || []).reduce((current, mark) => {
    const target = String(mark.text ?? mark.targetText ?? '').trim();
    const token = String(mark.token || '').trim();
    if (!target && !token) return current;
    return current.flatMap((part) => {
      if (part.mark) {
        return token && part.mark.token === token ? [{ ...part, mark: { ...part.mark, ...mark } }] : [part];
      }
      const index = target ? part.text.indexOf(target) : -1;
      if (index < 0) return [part];
      return [
        { text: part.text.slice(0, index) },
        { text: part.text.slice(index, index + target.length), mark },
        { text: part.text.slice(index + target.length) }
      ].filter((next) => next.text);
    });
  }, parts);
}

function annotatedHtml(value, marks = [], field = '') {
  const scopedMarks = (marks || []).filter((mark) => !mark.field || mark.field === field);
  return applyStructuredMarks(parseLegacyMarkedText(value), scopedMarks)
    .map((part) => {
      const text = escapeHtml(part.text);
      if (!part.mark) return text;
      return `<span class="template-mark mark-${normalizeMarkKind(part.mark)}" style="${markStyle(part.mark)}">${text}</span>`;
    })
    .join('');
}

function appendRichText(parent, tag, className, text, marks = [], field = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.innerHTML = annotatedHtml(text, marks, field);
  parent.appendChild(node);
  return node;
}

function appendMedia(parent, slide, payload) {
  if (!slide.image_url) return;
  const media = document.createElement('figure');
  const image = document.createElement('img');
  const frame = slide.image_frame || {};
  const hasFrame = Object.keys(frame).length > 0;
  media.className = 'preview-media';
  if (hasFrame) media.classList.add('has-frame');
  media.style.setProperty('--image-position', slide.image_position || 'center');
  media.style.setProperty('--image-fit', payload.image_fit || 'cover');
  if (frame.x !== undefined) media.style.left = `${frame.x}%`;
  if (frame.y !== undefined) media.style.top = `${frame.y}%`;
  if (frame.width !== undefined) media.style.width = `${frame.width}%`;
  if (frame.height !== undefined) media.style.height = `${frame.height}%`;
  if (frame.opacity !== undefined) media.style.opacity = frame.opacity;
  if (frame.radius !== undefined) media.style.borderRadius = `${frame.radius}px`;
  media.dataset.draggableImage = 'true';
  media.innerHTML = '<span class="resize-handle" aria-hidden="true"></span>';
  image.src = slide.image_url;
  image.alt = '';
  media.prepend(image);
  parent.appendChild(media);
}

function appendDecorativeElements(parent, elements = []) {
  for (const element of elements || []) {
    const node = element.type === 'arrow'
      ? document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      : document.createElement('span');

    const x = Number(element.x ?? 50);
    const y = Number(element.y ?? 78);
    const width = Number(element.width ?? 130);
    const height = Number(element.height ?? 40);
    const rotation = Number(element.rotation ?? 0);
    const stroke = Number(element.stroke ?? element.strokeWidth ?? 4);
    const fontSize = Number(element.font_size ?? element.fontSize ?? 28);
    node.classList.add('preview-decor', `preview-decor-${element.type || 'arrow'}`);
    node.style.left = `${x}%`;
    node.style.top = `${y}%`;
    node.style.width = `${width / 10}%`;
    node.style.height = `${height / 10}%`;
    node.style.color = element.color || '#FFFFFF';
    node.style.opacity = element.opacity ?? 1;
    node.style.borderWidth = `${Math.max(1, stroke / 3)}px`;
    node.style.fontFamily = element.font_family || element.fontFamily || 'Geist, sans-serif';
    node.style.fontSize = `${fontSize / 10.8}cqw`;
    node.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;

    if (element.type === 'arrow') {
      node.setAttribute('viewBox', '0 0 150 30');
      node.innerHTML = `<path d="M4 15H142" stroke="currentColor" stroke-width="${Math.max(1, stroke)}" stroke-linecap="round"/><path d="M129 4L143 15L129 26" stroke="currentColor" stroke-width="${Math.max(1, stroke)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else if (element.type === 'text') {
      node.textContent = element.label || '';
    }
    parent.appendChild(node);
  }
}

function updatePreview() {
  const payload = readPayload();
  const slides = getPreviewSlides(payload);
  previewIndex = Math.min(Math.max(previewIndex, 0), slides.length - 1);
  const slide = slides[previewIndex];
  const da = payload.da;
  const wrapper = document.createElement('div');
  const total = slides.length;

  wrapper.className = `preview-slide preview-${slide.type}${slide.image_url ? ' has-media' : ''}${slide.type === 'content' ? ' preview-content-slide' : ''}`;
  wrapper.style.setProperty('--slide-bg', da.background_color);
  wrapper.style.setProperty('--slide-cta-bg', da.cta_background_color);
  wrapper.style.setProperty('--slide-accent', da.accent_color);
  wrapper.style.setProperty('--slide-text', da.text_color);
  wrapper.style.setProperty('--slide-font', da.font_family);
  wrapper.style.setProperty('--slide-badge', da.badge_bg || da.accent_color);
  wrapper.style.setProperty('--slide-handle', da.handle_color || 'rgba(255,255,255,0.75)');
  wrapper.style.setProperty('--slide-decoration', da.decoration_color || 'rgba(157,189,202,0.45)');
  wrapper.style.setProperty('--slide-annotation', da.annotation_color || '#3D2B1F');
  wrapper.style.setProperty('--preview-title-size', `${parseInt(da.title_font_size || da.font_size_main || '72', 10) / 10.8}cqw`);
  wrapper.style.setProperty('--preview-subtitle-size', `${parseInt(da.subtitle_font_size || '42', 10) / 10.8}cqw`);
  wrapper.style.setProperty('--preview-body-size', `${parseInt(da.body_font_size || da.font_size_main || '72', 10) / 10.8}cqw`);
  wrapper.style.setProperty('--preview-handle-size', `${parseInt(da.handle_font_size || '30', 10) / 10.8}cqw`);

  appendMedia(wrapper, slide, payload);
  appendDecorativeElements(wrapper, [...(slide.elements || []), ...(payload.decorative_elements || [])]);

  if (slide.type === 'cover') {
    const content = document.createElement('section');
    content.className = 'preview-content';
    appendRichText(content, 'h3', 'preview-title', slide.title, slide.marks, 'cover_title');
    appendRichText(content, 'p', 'preview-subtitle', slide.subtitle, slide.marks, 'cover_subtitle');
    wrapper.appendChild(content);
  } else if (slide.type === 'content') {
    appendRichText(wrapper, 'h3', 'preview-content-title', slide.title, slide.marks, 'title');
    const body = document.createElement('div');
    body.className = 'preview-content preview-body';
    appendText(body, 'span', 'preview-bullet', da.bullet_icon);
    const richBody = document.createElement('span');
    richBody.innerHTML = annotatedHtml(slide.body || '', slide.marks, 'body');
    body.append(richBody);
    wrapper.appendChild(body);
  } else {
    const content = document.createElement('section');
    content.className = 'preview-content';
    const line = document.createElement('div');
    line.className = 'preview-line';
    content.appendChild(line);
    appendRichText(content, 'h3', 'preview-title', slide.title, slide.marks, 'cta_text');
    appendRichText(content, 'p', 'preview-subtitle', slide.subtitle, slide.marks, 'cta_sub');
    wrapper.appendChild(content);
  }

  appendText(wrapper, 'div', 'preview-handle', payload.account_handle_override || '@compte');
  previewStage.replaceChildren(wrapper);
  previewCount.textContent = `${previewIndex + 1}/${total}`;
  renderElementSummary(payload, slide);
}

function stripAnnotationMarkup(value) {
  return String(value || '')
    .replace(/\[\[([\s\S]+?)\]\]/g, (_, content) => content.includes('|') ? content.split('|').slice(1).join('|') : content)
    .replace(/__([\s\S]+?)__/g, (_, content) => content.includes('|') ? content.split('|').slice(1).join('|') : content);
}

function targetFieldElement(value) {
  if (value === 'cover_title') return form.elements.cover_title;
  if (value === 'cover_subtitle') return form.elements.cover_subtitle;
  if (value === 'cta_text') return form.elements.cta_text;
  if (value === 'cta_sub') return form.elements.cta_sub;
  const card = currentSlideCard();
  if (!card) return null;
  if (value === 'active_slide_title') return card.querySelector('[data-slide-title]');
  return card.querySelector('[data-slide-body]');
}

function targetMarksField(value) {
  if (value === 'cover_title') return { field: form.elements.cover_marks, name: 'cover_title' };
  if (value === 'cover_subtitle') return { field: form.elements.cover_marks, name: 'cover_subtitle' };
  if (value === 'cta_text') return { field: form.elements.cta_marks, name: 'cta_text' };
  if (value === 'cta_sub') return { field: form.elements.cta_marks, name: 'cta_sub' };
  const card = currentSlideCard();
  if (!card) return null;
  return {
    field: card.querySelector('[data-slide-marks]'),
    name: value === 'active_slide_title' ? 'title' : 'body'
  };
}

function markFromControls(target, fieldName) {
  const kind = annotationStyle.value;
  const token = `${kind}_${slugToken(target)}_${Date.now().toString(36).slice(-5)}`;
  const fontSize = Number(annotationFontSize.value || 0);
  return {
    kind,
    token,
    field: fieldName,
    text: target,
    color: annotationBuilderColor.value || form.elements.annotation_color.value,
    strokeWidth: Number(annotationStroke.value || (kind === 'underline' ? 6 : 4)),
    rotation: Number(annotationRotation.value || (kind === 'underline' ? -2 : -3)),
    opacity: Number(annotationOpacity.value || 1),
    ...(fontSize > 0 ? { fontSize } : {})
  };
}

function applyTargetAnnotation() {
  const field = targetFieldElement(annotationField.value);
  const marksTarget = targetMarksField(annotationField.value);
  const target = annotationTarget.value.trim();
  if (!field || !marksTarget || !target) {
    setError('Choisis un champ cible et un target a annoter.');
    return;
  }
  const cleanValue = stripAnnotationMarkup(field.value);
  if (!cleanValue.includes(target)) {
    setError(`Target introuvable dans le champ: "${target}".`);
    return;
  }
  const mark = markFromControls(target, marksTarget.name);
  const tokenSyntax = annotationStyle.value === 'circle' ? `[[${mark.token}|${target}]]` : `__${mark.token}|${target}__`;
  field.value = cleanValue.replace(target, tokenSyntax);
  writeJsonArrayField(marksTarget.field, [
    ...readJsonArrayField(marksTarget.field).filter((item) => item.token !== mark.token),
    mark
  ]);
  form.elements.annotation_color.value = annotationBuilderColor.value;
  setError('');
  updatePreview();
}

function clearTargetMarkup() {
  const field = targetFieldElement(annotationField.value);
  const marksTarget = targetMarksField(annotationField.value);
  if (!field) return;
  field.value = stripAnnotationMarkup(field.value);
  if (marksTarget?.field) writeJsonArrayField(marksTarget.field, []);
  updatePreview();
}

function elementFromControls() {
  return {
    type: document.querySelector('#element-type').value,
    x: Number(document.querySelector('#element-x').value || 50),
    y: Number(document.querySelector('#element-y').value || 78),
    width: Number(document.querySelector('#element-width').value || 140),
    height: Number(document.querySelector('#element-height').value || 28),
    color: document.querySelector('#element-color').value || '#FFFFFF',
    strokeWidth: Number(document.querySelector('#element-stroke').value || 4),
    opacity: Number(document.querySelector('#element-opacity').value || 1),
    rotation: Number(document.querySelector('#element-rotation').value || 0),
    label: document.querySelector('#element-label').value.trim(),
    fontFamily: document.querySelector('#element-font').value.trim() || 'Geist',
    fontSize: Number(document.querySelector('#element-font-size').value || 28)
  };
}

function scopedElementField(scope) {
  if (scope === 'cover') return form.elements.cover_elements;
  if (scope === 'cta') return form.elements.cta_elements;
  if (scope === 'active_slide') return currentSlideCard()?.querySelector('[data-slide-elements]');
  return form.elements.decorative_elements;
}

function addElementFromControls() {
  const field = scopedElementField(document.querySelector('#element-scope').value);
  if (!field) {
    setError('Passe sur une slide de contenu pour ajouter un element a la slide active.');
    return;
  }
  const next = [...readJsonArrayField(field), elementFromControls()];
  writeJsonArrayField(field, next);
  setError('');
  updatePreview();
}

function resetScopedElements() {
  const field = scopedElementField(document.querySelector('#element-scope').value);
  if (!field) return;
  writeJsonArrayField(field, []);
  updatePreview();
}

function renderElementSummary(payload, slide) {
  if (!elementSummary) return;
  const globalCount = payload.decorative_elements.length;
  const coverCount = payload.cover_elements.length;
  const ctaCount = payload.cta_elements.length;
  const slideCount = (slide?.elements || []).length;
  const markCount = (slide?.marks || []).length;
  elementSummary.innerHTML = `
    <span><strong>${globalCount}</strong> globaux</span>
    <span><strong>${coverCount}</strong> cover</span>
    <span><strong>${slideCount}</strong> slide affichee</span>
    <span><strong>${ctaCount}</strong> CTA</span>
    <span><strong>${markCount}</strong> annotations</span>
  `;
}

function downloadTemplate() {
  const payload = readPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const name = (payload.cover_title || 'carousel-template')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'carousel-template';
  link.href = url;
  link.download = `${name}.template`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importTemplate(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const rawTemplate = JSON.parse(text);
    const response = await fetch('/api/normalize-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rawTemplate)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Normalisation impossible.');
    fillForm(data);
  } catch (error) {
    setError(`Template invalide: ${error.message}`);
  }
}

async function loadStatus() {
  const response = await fetch('/api/status');
  const status = await response.json();
  lastGeneration.textContent = status.last_carousel
    ? `Derniere generation: ${formatDate(status.last_carousel.created_at)}`
    : 'Derniere generation: jamais';
  if (status.gemini) {
    renderGeminiStatus(status.gemini);
  }
}

function renderGeminiStatus(status = {}) {
  geminiStatus.textContent = status.configured
    ? `Gemini: ${status.model} (${status.source})`
    : 'Gemini: non configure';
}

async function loadGeminiStatus() {
  const response = await fetch('/api/gemini/status');
  renderGeminiStatus(await response.json());
}

geminiForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const apiKey = geminiForm.elements.gemini_api_key.value.trim();
  const model = geminiForm.elements.gemini_model.value.trim() || 'gemini-2.5-flash';
  try {
    const response = await fetch('/api/gemini/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, model })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Connexion Gemini impossible.');
    geminiForm.elements.gemini_api_key.value = '';
    renderGeminiStatus(data);
    setError('');
  } catch (error) {
    setError(error.message);
  }
});

geminiLogout.addEventListener('click', async () => {
  const response = await fetch('/api/gemini/logout', { method: 'POST' });
  renderGeminiStatus(await response.json());
});

async function loadHistory() {
  loadingState.hidden = false;
  const response = await fetch('/api/carousels?limit=20');
  const data = await response.json();
  historyBody.innerHTML = '';

  for (const carousel of data.carousels) {
    const row = document.createElement('tr');
    const dateCell = document.createElement('td');
    const titleCell = document.createElement('td');
    const accountCell = document.createElement('td');
    const slidesCell = document.createElement('td');
    const actionCell = document.createElement('td');
    const link = document.createElement('a');

    dateCell.className = 'mono muted';
    accountCell.className = 'muted';
    slidesCell.className = 'mono';
    if (carousel.zip_path && carousel.status !== 'error') {
      link.className = 'download-link';
      link.href = `/api/carousels/${carousel.id}/download`;
      link.textContent = carousel.status === 'partial' ? 'ZIP partiel' : 'ZIP';
    } else {
      link.className = 'muted';
      link.textContent = 'Indisponible';
    }

    dateCell.textContent = formatDate(carousel.created_at);
    titleCell.textContent = carousel.cover_title;
    accountCell.textContent = carousel.account_slug;
    slidesCell.textContent = carousel.slides_count;
    actionCell.appendChild(link);
    row.append(dateCell, titleCell, accountCell, slidesCell, actionCell);
    historyBody.appendChild(row);
  }

  emptyState.hidden = data.carousels.length > 0;
  loadingState.hidden = true;
  await loadStatus();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = readPayload();
  const validationError = validatePayload(payload);
  const elementError = validateDecorativeElements();
  if (validationError || elementError) {
    setError(validationError || elementError);
    return;
  }

  setError('');
  submitButton.disabled = true;
  submitButton.querySelector('span').textContent = 'Generation en cours...';

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Generation impossible.');
    await loadHistory();
  } catch (error) {
    setError(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector('span').textContent = 'Generer pour tous les comptes';
  }
});

form.addEventListener('input', updatePreview);
form.addEventListener('change', updatePreview);
form.elements.cover_image_file.addEventListener('change', async () => {
  try {
    await bindImageUpload(form.elements.cover_image_file, form.elements.cover_image_url);
  } catch (error) {
    setError(error.message);
  }
});
form.elements.cta_image_file.addEventListener('change', async () => {
  try {
    await bindImageUpload(form.elements.cta_image_file, form.elements.cta_image_url);
  } catch (error) {
    setError(error.message);
  }
});
document.querySelector('#add-slide').addEventListener('click', () => addSlide());
document.querySelector('#fill-example').addEventListener('click', () => fillForm(example));
document.querySelector('#refresh-history').addEventListener('click', loadHistory);
document.querySelector('#export-template').addEventListener('click', downloadTemplate);
document.querySelector('#import-template').addEventListener('change', (event) => importTemplate(event.target.files?.[0]));
document.querySelector('#apply-annotation').addEventListener('click', applyTargetAnnotation);
document.querySelector('#clear-markup').addEventListener('click', clearTargetMarkup);
document.querySelector('#add-element').addEventListener('click', addElementFromControls);
document.querySelector('#reset-elements').addEventListener('click', resetScopedElements);
annotationBuilderColor.addEventListener('input', () => {
  form.elements.annotation_color.value = annotationBuilderColor.value;
  updatePreview();
});
form.elements.annotation_color.addEventListener('input', () => {
  annotationBuilderColor.value = form.elements.annotation_color.value;
});
document.querySelector('#prev-preview').addEventListener('click', () => {
  previewIndex -= 1;
  updatePreview();
});
document.querySelector('#next-preview').addEventListener('click', () => {
  previewIndex += 1;
  updatePreview();
});

function activeImageFrameField() {
  const payload = readPayload();
  const slides = getPreviewSlides(payload);
  const slide = slides[previewIndex];
  if (!slide) return null;
  if (slide.type === 'cover') return form.elements.cover_image_frame;
  if (slide.type === 'cta') return form.elements.cta_image_frame;
  return currentSlideCard()?.querySelector('[data-slide-image-frame]') || null;
}

function currentImageFrame() {
  const field = activeImageFrameField();
  return readJsonArrayField(field)[0] || { x: 50, y: 35, width: 80, height: 28, opacity: 0.32, radius: 32 };
}

function saveCurrentImageFrame(frame) {
  const field = activeImageFrameField();
  if (!field) return;
  writeJsonArrayField(field, [frame]);
  updatePreview();
}

previewStage.addEventListener('pointerdown', (event) => {
  const media = event.target.closest?.('.preview-media');
  if (!media) return;
  const stageBox = previewStage.getBoundingClientRect();
  const frame = currentImageFrame();
  const start = {
    x: event.clientX,
    y: event.clientY,
    frame: { ...frame },
    resize: event.target.classList.contains('resize-handle')
  };
  media.setPointerCapture?.(event.pointerId);

  function move(pointerEvent) {
    const dx = ((pointerEvent.clientX - start.x) / stageBox.width) * 100;
    const dy = ((pointerEvent.clientY - start.y) / stageBox.height) * 100;
    const next = { ...start.frame };
    if (start.resize) {
      next.width = Math.min(100, Math.max(8, Number(start.frame.width || 80) + dx));
      next.height = Math.min(100, Math.max(8, Number(start.frame.height || 28) + dy));
    } else {
      next.x = Math.min(100, Math.max(0, Number(start.frame.x || 50) + dx));
      next.y = Math.min(100, Math.max(0, Number(start.frame.y || 35) + dy));
    }
    saveCurrentImageFrame(next);
  }

  function up() {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  }

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, { once: true });
});

fillForm(example);
loadGeminiStatus().catch(() => {});
loadHistory().catch((error) => setError(error.message));
