import { spawn } from 'node:child_process';
import { getGeminiApiKey, getGeminiSettings } from './gemini-settings.js';
import { templateFromPrompt } from './prompt-template.js';
import { normalizeTemplate } from './template-normalizer.js';

function splitArgs(value) {
  return String(value || '')
    .match(/(?:[^\s"]+|"[^"]*")+/g)
    ?.map((part) => part.replace(/^"|"$/g, '')) || [];
}

function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Gemini CLI a retourne une reponse vide.');

  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error('Impossible de parser le JSON retourne par Gemini CLI.');
  }
}

function stripAnnotationTokens(value) {
  return String(value || '')
    .replace(/\[\[([\s\S]+?)\]\]/g, (_, content) => content.includes('|') ? content.split('|').slice(1).join('|') : content)
    .replace(/__([\s\S]+?)__/g, (_, content) => content.includes('|') ? content.split('|').slice(1).join('|') : content);
}

function tokenFor(index, field, kind) {
  return `auto_${kind}_${field.replace(/[^a-z0-9]+/gi, '_')}_${index}`;
}

function pickMarkPhrase(value) {
  const text = stripAnnotationTokens(value).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const words = text.match(/[\p{L}\p{N}'’-]+/gu) || [];
  if (words.length === 0) return '';
  const size = Math.min(words.length, words.length >= 4 ? 3 : 2);
  const start = Math.max(0, Math.floor((words.length - size) / 2));
  return words.slice(start, start + size).join(' ');
}

function addTokenToText(value, phrase, kind, token) {
  if (!phrase || /\[\[|__/.test(String(value || ''))) return value;
  const text = String(value || '');
  const index = text.indexOf(phrase);
  if (index < 0) return value;
  const wrapped = kind === 'underline' ? `__${token}|${phrase}__` : `[[${token}|${phrase}]]`;
  return `${text.slice(0, index)}${wrapped}${text.slice(index + phrase.length)}`;
}

function markPattern(baseTemplate = {}) {
  const fromSlides = Array.isArray(baseTemplate.slides)
    ? baseTemplate.slides.flatMap((slide) => Array.isArray(slide.marks) ? slide.marks : [])
    : [];
  const candidates = [
    ...(Array.isArray(baseTemplate.cover_marks) ? baseTemplate.cover_marks : []),
    ...(Array.isArray(baseTemplate.cta_marks) ? baseTemplate.cta_marks : []),
    ...fromSlides,
    ...(Array.isArray(baseTemplate.marks) ? baseTemplate.marks : [])
  ].filter((mark) => ['circle', 'ellipse', 'underline', 'handdrawncircle', 'handdrawnunderline'].includes(String(mark.kind || mark.type || mark.style || '').toLowerCase()));

  if (candidates.length) return candidates;
  return [];
}

function ensureSlideMark(slide, pattern, index) {
  if (!pattern.length || !slide || (Array.isArray(slide.marks) && slide.marks.length)) return slide;
  const field = slide.body ? 'body' : 'title';
  const source = slide[field] || '';
  const phrase = pickMarkPhrase(source);
  if (!phrase) return slide;
  const sourceMark = pattern[index % pattern.length];
  const kindRaw = String(sourceMark.kind || sourceMark.type || sourceMark.style || 'circle').toLowerCase();
  const kind = kindRaw.includes('underline') ? 'underline' : 'circle';
  const token = tokenFor(index + 1, field, kind);
  const next = { ...slide };
  next[field] = addTokenToText(source, phrase, kind, token);
  next.marks = [{
    ...sourceMark,
    kind,
    token,
    field,
    text: phrase
  }];
  return next;
}

function ensureCtaMark(template, pattern) {
  if (!pattern.length || (Array.isArray(template.cta_marks) && template.cta_marks.length)) return template;
  const field = template.cta_sub ? 'cta_sub' : 'cta_text';
  const phrase = pickMarkPhrase(template[field]);
  if (!phrase) return template;
  const sourceMark = pattern[1 % pattern.length] || pattern[0];
  const kindRaw = String(sourceMark.kind || sourceMark.type || sourceMark.style || 'underline').toLowerCase();
  const kind = kindRaw.includes('circle') ? 'circle' : 'underline';
  const token = tokenFor(1, field, kind);
  return {
    ...template,
    [field]: addTokenToText(template[field], phrase, kind, token),
    cta_marks: [{
      ...sourceMark,
      kind,
      token,
      field,
      text: phrase
    }]
  };
}

function spreadAdaptiveMarks(template, baseTemplate) {
  const pattern = markPattern(baseTemplate);
  if (!pattern.length) return template;
  const slides = Array.isArray(template.slides)
    ? template.slides.map((slide, index) => ensureSlideMark(slide, pattern, index))
    : template.slides;
  return ensureCtaMark({ ...template, slides }, pattern);
}

export async function geminiCliEnabled() {
  return (await getGeminiSettings()).cli_enabled;
}

export function geminiCliStatus({ timeoutMs = 8000 } = {}) {
  const command = process.env.GEMINI_CLI_COMMAND || 'gemini';
  return new Promise((resolve) => {
    const child = spawn(command, ['--version'], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ installed: false, ok: false, error: `Timeout ${timeoutMs}ms` });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ installed: false, ok: false, error: error.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        installed: code === 0,
        ok: code === 0,
        version: (stdout || stderr).trim(),
        error: code === 0 ? '' : (stderr || stdout || `exit ${code}`).trim()
      });
    });
  });
}

async function runGeminiApi(prompt) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY manquant.');
  const { model } = await getGeminiSettings();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: 'application/json'
      }
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Gemini API HTTP ${response.status}`);
  }
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '';
}

export function runGeminiCli(prompt, { timeoutMs = Number(process.env.GEMINI_CLI_TIMEOUT_MS || 120000) } = {}) {
  const command = process.env.GEMINI_CLI_COMMAND || 'gemini';
  const configuredArgs = splitArgs(process.env.GEMINI_CLI_ARGS || '-p');
  const hasPromptPlaceholder = configuredArgs.some((arg) => arg.includes('{prompt}'));
  const args = hasPromptPlaceholder
    ? configuredArgs.map((arg) => arg.replace('{prompt}', prompt))
    : [...configuredArgs, prompt];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Gemini CLI timeout apres ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Gemini CLI exit ${code}: ${stderr || stdout}`.trim()));
        return;
      }
      resolve(stdout);
    });
  });
}

export async function templateWithGemini({ topic, baseTemplate = {}, account = {}, prompt = '' }) {
  const accountLanguage = account.language || account.content_language || 'francais';
  const ctaInstruction = account.cta_instruction
    ? `CTA obligatoire du compte, a respecter exactement dans le fond et dans la langue du compte: ${account.cta_instruction}`
    : (account.cta_type === 'comment' && account.cta_keyword
      ? `CTA obligatoire: incite a commenter exactement "${account.cta_keyword}" pour recevoir la ressource.`
      : `CTA obligatoire: incite a acheter ou recuperer ${account.cta_offer || 'l ebook sommeil bebe en bio'} via le lien en bio.`);
  const fallbackPrompt = [
    topic || prompt || 'Sommeil de bebe',
    baseTemplate.cover_title ? `Template base: ${baseTemplate.cover_title}` : '',
    account.handle ? `Handle: ${account.handle}` : ''
  ].filter(Boolean).join('\n');

  const settings = await getGeminiSettings();
  const apiKey = await getGeminiApiKey();
  const useCli = settings.mode === 'cli' || (!apiKey && settings.cli_enabled);

  if (!useCli && !apiKey) {
    return normalizeTemplate(templateFromPrompt(fallbackPrompt, baseTemplate));
  }

  const instruction = [
    'Tu generes le contenu texte d un carousel Instagram.',
    'Retourne uniquement un JSON valide compatible avec ce schema:',
    '{ "cover_title": string, "cover_subtitle": string, "slides": [{"title": string, "body": string}], "cta_text": string, "cta_sub": string }',
    'Le carousel final doit faire entre 3 et 7 slides au total. Comme la cover et le CTA existent deja, retourne entre 1 et 5 slides de contenu maximum.',
    'Garde la DA, les images, les decorations et les champs existants du template de base quand ils existent.',
    'Si le template de base contient des annotations tokenisees comme [[token|texte]] ou __token|texte__, conserve le meme token autour du nouveau segment equivalent, meme si le nouveau segment est plus long.',
    'Ne transforme pas ces annotations en markdown: ce sont des marqueurs de rendu pour cercles et soulignements adaptatifs.',
    'Tous les posts doivent rester dans la niche sommeil de bebe: endormissement, reveils nocturnes, siestes, dette de sommeil, routines, rythmes ou fatigue parentale.',
    `Langue obligatoire pour tout le texte: ${accountLanguage}.`,
    'Utilise une langue naturelle, concrete, sans markdown.',
    ctaInstruction,
    'Le CTA final ne doit pas etre un simple "abonne-toi".',
    `Theme: ${topic || prompt || baseTemplate.cover_title || 'Sommeil de bebe'}`,
    `Compte: ${account.name || account.slug || 'compte'}`,
    `Handle: ${account.handle || ''}`,
    `Template de base JSON: ${JSON.stringify(baseTemplate)}`
  ].join('\n');

  const output = !useCli && apiKey
    ? await runGeminiApi(instruction)
    : await runGeminiCli(instruction);
  const generated = extractJson(output);
  const generatedSlides = Array.isArray(generated.slides)
    ? generated.slides.slice(0, 5).map((slide, index) => {
      const baseSlide = Array.isArray(baseTemplate.slides) ? baseTemplate.slides[index] || {} : {};
      return {
        ...baseSlide,
        ...slide,
        marks: slide.marks || baseSlide.marks || [],
        elements: slide.elements || baseSlide.elements || []
      };
    })
    : baseTemplate.slides;

  return normalizeTemplate(spreadAdaptiveMarks({
    ...baseTemplate,
    ...generated,
    slides: generatedSlides,
    cover_marks: generated.cover_marks || baseTemplate.cover_marks || [],
    cta_marks: generated.cta_marks || baseTemplate.cta_marks || [],
    cover_elements: generated.cover_elements || baseTemplate.cover_elements || [],
    cta_elements: generated.cta_elements || baseTemplate.cta_elements || [],
    da: {
      ...(baseTemplate.da || {}),
      ...(generated.da || {})
    },
    decorative_elements: generated.decorative_elements || baseTemplate.decorative_elements || []
  }, baseTemplate));
}
