import archiver from 'archiver';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import chromium from '@sparticuz/chromium';

dotenv.config();

const projectRoot = process.cwd();
let chromiumExecutablePathPromise = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fillTemplate(html, variables) {
  return html
    .replace(/\{\{\{\s*([\w.-]+)\s*\}\}\}/g, (_, key) => String(variables[key] ?? ''))
    .replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => escapeHtml(variables[key] ?? ''));
}

function cssSize(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const text = String(value).trim();
  return /^\d+(\.\d+)?$/.test(text) ? `${text}px` : text;
}

function cssColor(value, fallback = '#FFFFFF') {
  const text = String(value || fallback).trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(text)) return text;
  if (/^rgba?\([\d\s.,%]+\)$/.test(text)) return text;
  if (/^hsla?\([\d\s.,%degturnrad-]+\)$/.test(text)) return text;
  if (/^var\(--[\w-]+(?:,\s*[^)]+)?\)$/.test(text)) return text;
  if (/^[a-zA-Z]+$/.test(text)) return text;
  return fallback;
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function normalizeKind(value, fallback = 'arrow') {
  const kind = String(value || fallback).toLowerCase();
  if (kind === 'text' || kind === 'free_text' || kind === 'freetext') return 'text';
  if (kind === 'handdrawncircle') return 'circle';
  if (kind === 'handdrawnunderline') return 'underline';
  if (kind === 'ellipse') return 'ellipse';
  if (kind === 'underline') return 'underline';
  if (kind === 'circle') return 'circle';
  if (kind === 'line') return 'line';
  if (kind === 'arrow') return 'arrow';
  return fallback;
}

function styleDeclaration(properties) {
  return Object.entries(properties)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}:${value};`)
    .join('');
}

function cssFontFamily(value) {
  if (value === undefined || value === null || value === '') return '';
  return String(value).replace(/[;"{}<>]/g, '').trim();
}

function markStyle(mark = {}) {
  const strokeWidth = clampNumber(mark.strokeWidth ?? mark.stroke_width, 3, 0.5, 40);
  const rotation = clampNumber(mark.rotation, mark.kind === 'underline' ? -1.8 : -3, -360, 360);
  const opacity = clampNumber(mark.opacity, 1, 0, 1);
  const fontFamily = cssFontFamily(mark.fontFamily ?? mark.font_family);
  const style = {
    '--mark-color': cssColor(mark.color, 'var(--annotation-color)'),
    '--mark-stroke': cssSize(strokeWidth, '3px'),
    '--mark-rotation': `${rotation}deg`,
    '--mark-opacity': opacity,
    'font-family': fontFamily || undefined,
    'font-size': mark.fontSize || mark.font_size ? cssSize(mark.fontSize ?? mark.font_size, '') : undefined
  };
  return styleDeclaration(style);
}

function markClasses(mark = {}) {
  const kind = normalizeKind(mark.kind || mark.type || mark.style, 'circle');
  const normalizedKind = kind === 'ellipse' ? 'circle' : kind;
  return `template-mark mark-${normalizedKind}`;
}

function markedSpan(mark, text) {
  const token = mark?.token ? ` data-token="${escapeHtml(mark.token)}"` : '';
  return `<span class="${markClasses(mark)}"${token} style="${markStyle(mark)}">${text}</span>`;
}

function parseLegacyMarkedText(value) {
  const text = String(value ?? '');
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

    if (nextIndex > index) {
      parts.push({ text: text.slice(index, nextIndex) });
    }

    const isCircle = text.startsWith('[[', nextIndex);
    const open = isCircle ? '[[' : '__';
    const close = isCircle ? ']]' : '__';
    const endIndex = text.indexOf(close, nextIndex + open.length);

    if (endIndex < 0) {
      parts.push({ text: text.slice(nextIndex) });
      break;
    }

    const content = text.slice(nextIndex + open.length, endIndex);
    const separatorIndex = content.indexOf('|');
    const token = separatorIndex > 0 ? content.slice(0, separatorIndex).trim() : '';
    const markedText = separatorIndex > 0 ? content.slice(separatorIndex + 1) : content;
    parts.push({
      text: markedText,
      mark: {
        kind: isCircle ? 'circle' : 'underline',
        token: token || undefined
      }
    });
    index = endIndex + close.length;
  }

  return parts;
}

function applyTargetMarks(parts, marks = []) {
  if (!Array.isArray(marks) || marks.length === 0) return parts;
  return marks.reduce((currentParts, mark) => {
    const kind = normalizeKind(mark.kind || mark.type || mark.style, '');
    if (kind !== 'circle' && kind !== 'ellipse' && kind !== 'underline') return currentParts;

    const target = String(mark.text ?? mark.targetText ?? '').trim();
    const token = String(mark.token || '').trim();
    if (!target && !token) return currentParts;

    return currentParts.flatMap((part) => {
      if (part.mark) {
        if ((token && part.mark.token === token) || (target && part.text === target)) {
          return [{ ...part, mark: { ...part.mark, ...mark } }];
        }
        return [part];
      }

      const source = part.text;
      const targetIndex = target ? source.indexOf(target) : -1;
      if (targetIndex < 0) return [part];

      return [
        { text: source.slice(0, targetIndex) },
        { text: source.slice(targetIndex, targetIndex + target.length), mark },
        { text: source.slice(targetIndex + target.length) }
      ].filter((nextPart) => nextPart.text !== '');
    });
  }, parts);
}

function annotatedText(value, marks = []) {
  const parts = applyTargetMarks(parseLegacyMarkedText(value), marks);
  return parts.map((part) => {
    const escaped = escapeHtml(part.text);
    return part.mark ? markedSpan(part.mark, escaped) : escaped;
  }).join('');
}

function fieldMarks(marks, field) {
  if (!Array.isArray(marks)) return [];
  return marks.filter((mark) => !mark.field || mark.field === field);
}

function allMarks(...groups) {
  return groups.flatMap((group) => (Array.isArray(group) ? group : []));
}

function decorativeElementsHtml(elements = []) {
  if (!Array.isArray(elements) || elements.length === 0) return '';

  return elements.map((element) => {
    const type = normalizeKind(element.kind || element.type, 'arrow');
    const x = clampNumber(element.x, 50, 0, 100);
    const y = clampNumber(element.y, 78, 0, 100);
    const width = clampNumber(element.width, 130, 10, 1000);
    const height = clampNumber(element.height, 60, 10, 1000);
    const rotation = clampNumber(element.rotation, 0, -360, 360);
    const color = cssColor(element.color, '#FFFFFF');
    const opacity = clampNumber(element.opacity, 1, 0, 1);
    const strokeWidth = clampNumber(element.strokeWidth ?? element.stroke_width ?? element.stroke, 3, 0.5, 40);
    const label = escapeHtml(element.label || element.text || '');
    const fontFamily = cssFontFamily(element.fontFamily ?? element.font_family);
    const style = styleDeclaration({
      left: `${x}%`,
      top: `${y}%`,
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(-50%,-50%) rotate(${rotation}deg)`,
      opacity,
      color,
      '--decor-stroke': cssSize(strokeWidth, '3px'),
      'font-family': fontFamily || undefined,
      'font-size': element.fontSize || element.font_size ? cssSize(element.fontSize ?? element.font_size, '30px') : undefined
    });

    if (type === 'circle' || type === 'ellipse') {
      return `<span class="decor decor-circle" style="${style}"></span>`;
    }
    if (type === 'line' || type === 'underline') {
      return `<span class="decor decor-line" style="${style}"></span>`;
    }
    if (type === 'text') {
      return `<span class="decor decor-text" style="${style}">${label}</span>`;
    }
    return `<svg class="decor decor-arrow" style="${style}" viewBox="0 0 150 30" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 15H142" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M129 4L143 15L129 26" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }).join('');
}

async function launchBrowser() {
  const options = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };

  if (process.env.VERCEL) {
    options.args = chromium.args;
    options.defaultViewport = chromium.defaultViewport;
    chromiumExecutablePathPromise ||= chromium.executablePath();
    options.executablePath = await chromiumExecutablePathPromise;
    options.headless = chromium.headless;
  } else if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    options.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  try {
    return await puppeteer.launch(options);
  } catch (error) {
    if (!String(error.message || '').includes('ETXTBSY')) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return puppeteer.launch(options);
  }
}

function navigationTimeoutMs() {
  return Number(process.env.PUPPETEER_NAVIGATION_TIMEOUT_MS || 60000);
}

export async function renderSlide(templateName, variables, outputPath) {
  const browser = await launchBrowser();
  try {
    return await renderSlideWithBrowser(browser, templateName, variables, outputPath);
  } finally {
    await browser.close();
  }
}

async function waitForPageAssets(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    const images = Array.from(document.images || []);
    await Promise.all(images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    }));
  });
}

async function fitTextBeforeCapture(page) {
  await page.evaluate(() => {
    const content = document.querySelector('.content');
    if (!content) return;

    const textNodes = Array.from(content.querySelectorAll('h1, h2, p, .body'));
    if (textNodes.length === 0) return;

    const bottomGuards = [
      ...Array.from(document.querySelectorAll('.decor-arrow')).map((node) => node.getBoundingClientRect().top - 44),
      ...Array.from(document.querySelectorAll('.handle')).map((node) => node.getBoundingClientRect().top - 52),
      890
    ].filter((value) => Number.isFinite(value));
    const maxBottom = Math.max(700, Math.min(...bottomGuards));
    const minTop = 168;
    const minSize = 34;

    for (let attempt = 0; attempt < 28; attempt += 1) {
      const bounds = content.getBoundingClientRect();
      const tooLow = bounds.bottom > maxBottom;
      const tooHigh = bounds.top < minTop;
      const tooWide = bounds.left < 36 || bounds.right > 1044;
      if (!tooLow && !tooHigh && !tooWide) break;

      textNodes.forEach((node) => {
        const current = Number.parseFloat(window.getComputedStyle(node).fontSize) || 48;
        node.style.fontSize = `${Math.max(minSize, current * 0.94)}px`;
      });

      const everyNodeAtMinimum = textNodes.every((node) => (
        (Number.parseFloat(window.getComputedStyle(node).fontSize) || minSize) <= minSize + 0.5
      ));
      if (everyNodeAtMinimum) break;
    }
  });
}

async function renderSlideWithBrowser(browser, templateName, variables, outputPath) {
  const templatePath = path.join(projectRoot, 'templates', templateName);
  const html = fillTemplate(fs.readFileSync(templatePath, 'utf8'), variables);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const page = await browser.newPage();
  try {
    page.setDefaultNavigationTimeout(navigationTimeoutMs());
    await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs() });
    await waitForPageAssets(page);
    await fitTextBeforeCapture(page);
    const highResPath = `${outputPath}.tmp.png`;
    await page.screenshot({
      path: highResPath,
      type: 'png',
      clip: { x: 0, y: 0, width: 1080, height: 1080 }
    });
    await sharp(highResPath)
      .resize(1080, 1080, { fit: 'cover' })
      .png({ quality: 100 })
      .toFile(outputPath);
    fs.unlinkSync(highResPath);
    return outputPath;
  } finally {
    await page.close();
  }
}

function zipFiles(files, zipPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(zipPath), { recursive: true });
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(zipPath));
    archive.on('error', reject);
    archive.pipe(output);

    for (const filePath of files) {
      archive.file(filePath, { name: path.basename(filePath) });
    }

    archive.finalize();
  });
}

function baseVariables(accountConfig, totalSlides) {
  const da = accountConfig.da || {};
  const custom = accountConfig.custom || {};
  const mergedDa = {
    ...da,
    ...custom.da
  };
  return {
    background_color: '#7A9BAD',
    text_color: '#FFFFFF',
    handle_color: 'rgba(255,255,255,0.75)',
    badge_bg: '#4A6270',
    annotation_color: '#3D2B1F',
    decoration_color: 'rgba(157,189,202,0.45)',
    font_family: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
    font_body: "'DM Sans', Arial, sans-serif",
    google_fonts_url: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500&display=swap',
    font_size_main: '72px',
    title_font_size: '72px',
    subtitle_font_size: '42px',
    body_font_size: '72px',
    content_title_font_size: '52px',
    handle_font_size: '30px',
    line_height: '1.28',
    ...mergedDa,
    cta_background_color: mergedDa.cta_background_color || mergedDa.background_color,
    account_handle: custom.handle || accountConfig.handle,
    image_fit: custom.image_fit || 'cover',
    total_slides: totalSlides
  };
}

function imageVariables(imageUrl, imagePosition = 'center') {
  const hasImage = Boolean(imageUrl);
  return {
    image_url: imageUrl || '',
    image_position: imagePosition || 'center',
    image_class: hasImage ? 'media has-image' : 'media no-image'
  };
}

function imageFrameVariables(frame = {}, defaults = {}) {
  return {
    image_x: `${clampNumber(frame.x, defaults.x ?? 50, 0, 100)}%`,
    image_y: `${clampNumber(frame.y, defaults.y ?? 50, 0, 100)}%`,
    image_width: `${clampNumber(frame.width, defaults.width ?? 100, 5, 100)}%`,
    image_height: `${clampNumber(frame.height, defaults.height ?? 100, 5, 100)}%`,
    image_opacity: clampNumber(frame.opacity, defaults.opacity ?? 1, 0, 1),
    image_radius: cssSize(frame.radius ?? frame.borderRadius, defaults.radius ?? '0px')
  };
}

export async function renderCarousel(carouselData, accountConfig, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  const contentSlides = Array.isArray(carouselData.slides) ? carouselData.slides : [];
  const totalSlides = contentSlides.length + 2;
  const shared = baseVariables(accountConfig, totalSlides);
  const globalElements = Array.isArray(carouselData.decorative_elements) ? carouselData.decorative_elements : [];
  const slidePaths = [];
  const errors = [];

  const jobs = [
    {
      template: 'slide-cover.html',
      variables: {
	        ...shared,
	        ...imageVariables(carouselData.cover_image_url, carouselData.cover_image_position),
	        ...imageFrameVariables(carouselData.cover_image_frame || carouselData.image_frame || {}, { width: 100, height: 100, opacity: 0.14, radius: '0px' }),
        cover_title: carouselData.cover_title,
        cover_title_html: annotatedText(carouselData.cover_title, allMarks(fieldMarks(carouselData.cover_marks, 'cover_title'), fieldMarks(carouselData.marks, 'cover_title'))),
        cover_subtitle: carouselData.cover_subtitle,
        cover_subtitle_html: annotatedText(carouselData.cover_subtitle, allMarks(fieldMarks(carouselData.cover_marks, 'cover_subtitle'), fieldMarks(carouselData.marks, 'cover_subtitle'))),
        elements_html: decorativeElementsHtml([...(carouselData.cover_elements || []), ...globalElements]),
        slide_number: `1/${totalSlides}`
      }
    },
    ...contentSlides.map((slide, index) => ({
      template: 'slide-content.html',
      variables: {
	        ...shared,
	        ...imageVariables(slide.image_url, slide.image_position),
	        ...imageFrameVariables(slide.image_frame || carouselData.image_frame || {}, { y: 31, width: 80, height: 28, opacity: 0.32, radius: '32px' }),
        slide_title: slide.title || '',
        slide_title_html: annotatedText(slide.title || '', allMarks(fieldMarks(slide.marks, 'title'), fieldMarks(carouselData.marks, `slides.${index}.title`))),
        slide_body: slide.body || '',
        slide_body_html: annotatedText(slide.body || '', allMarks(fieldMarks(slide.marks, 'body'), fieldMarks(carouselData.marks, `slides.${index}.body`))),
        elements_html: decorativeElementsHtml([...(slide.elements || []), ...globalElements]),
        slide_number: `${index + 2}/${totalSlides}`
      }
    })),
    {
      template: 'slide-cta.html',
      variables: {
	        ...shared,
	        ...imageVariables(carouselData.cta_image_url, carouselData.cta_image_position),
	        ...imageFrameVariables(carouselData.cta_image_frame || carouselData.image_frame || {}, { width: 100, height: 100, opacity: 0.16, radius: '0px' }),
        cta_text: carouselData.cta_text,
        cta_text_html: annotatedText(carouselData.cta_text, allMarks(fieldMarks(carouselData.cta_marks, 'cta_text'), fieldMarks(carouselData.marks, 'cta_text'))),
        cta_sub: carouselData.cta_sub,
        cta_sub_html: annotatedText(carouselData.cta_sub, allMarks(fieldMarks(carouselData.cta_marks, 'cta_sub'), fieldMarks(carouselData.marks, 'cta_sub'))),
        elements_html: decorativeElementsHtml([...(carouselData.cta_elements || []), ...globalElements]),
        slide_number: `${totalSlides}/${totalSlides}`
      }
    }
  ];

  const browser = await launchBrowser();
  try {
    for (let index = 0; index < jobs.length; index += 1) {
      const fileName = `slide-${String(index + 1).padStart(2, '0')}.png`;
      const outputPath = path.join(outputDir, fileName);
      try {
        await renderSlideWithBrowser(browser, jobs[index].template, jobs[index].variables, outputPath);
        slidePaths.push(outputPath);
      } catch (error) {
        errors.push(`Slide ${index + 1}: ${error.message}`);
        console.error(error);
      }
    }
  } finally {
    await browser.close();
  }

  const zipPath = path.join(outputDir, 'carousel.zip');
  if (slidePaths.length > 0) {
    await zipFiles(slidePaths, zipPath);
  }

  return {
    slides: slidePaths,
    zipPath: slidePaths.length > 0 ? zipPath : null,
    errors
  };
}
