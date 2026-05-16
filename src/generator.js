import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { createRun, finishRun, insertCarousel } from './db.js';
import { renderCarousel } from './renderer.js';
import { publishFile } from './public-files.js';
import { normalizeTemplate } from './template-normalizer.js';
import { loadAccountsAsync, loadAccountsSync } from './account-store.js';

dotenv.config();

const outputBaseDir = process.env.OUTPUT_DIR || (process.env.VERCEL ? '/tmp/carousel-output' : './output');

export function slugify(input) {
  return String(input || 'carousel')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'carousel';
}

export function loadAccounts() {
  return loadAccountsSync();
}

export function validateCarouselData(carouselData) {
  carouselData = normalizeTemplate(carouselData);
  const errors = [];

  if (!carouselData || typeof carouselData !== 'object') {
    return ['Payload JSON invalide.'];
  }

  if (!carouselData.cover_title?.trim()) errors.push('Cover Title est obligatoire.');
  if (carouselData.cover_subtitle === undefined || carouselData.cover_subtitle === null) errors.push('Cover Subtitle est obligatoire.');
  if (!Array.isArray(carouselData.slides) || carouselData.slides.length === 0) {
    errors.push('Ajoute au moins une slide de contenu pour obtenir 3 slides au total.');
  }
  if (Array.isArray(carouselData.slides) && carouselData.slides.length > 5) {
    errors.push('Un post doit faire 3 a 7 slides au total: garde au maximum 5 slides de contenu entre la cover et le CTA.');
  }
  if (!carouselData.cta_text?.trim()) errors.push('CTA Text est obligatoire.');
  if (!carouselData.cta_sub?.trim()) errors.push('CTA Sub est obligatoire.');

  return errors;
}

export async function generateForAccounts(carouselData, { accountSlugs = [] } = {}) {
  carouselData = normalizeTemplate(carouselData);
  const validationErrors = validateCarouselData(carouselData);
  if (validationErrors.length > 0) {
    const error = new Error(validationErrors.join(' '));
    error.statusCode = 400;
    throw error;
  }

  const requestedSlugs = Array.isArray(accountSlugs)
    ? accountSlugs.map((slug) => String(slug || '').trim()).filter(Boolean)
    : [];
  const accounts = (await loadAccountsAsync())
    .filter((account) => requestedSlugs.length === 0 || requestedSlugs.includes(account.slug));
  if (accounts.length === 0) {
    const error = new Error(requestedSlugs.length > 0
      ? `Aucun compte trouve pour: ${requestedSlugs.join(', ')}.`
      : 'Aucun compte configure dans accounts/*.json.');
    error.statusCode = 400;
    throw error;
  }

  const runId = createRun();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseSlug = `${timestamp}_${slugify(carouselData.cover_title)}`;
  const results = [];
  const errorLog = [];

  try {
    for (const account of accounts) {
      const accountOutputDir = path.join(outputBaseDir, baseSlug, account.slug);
      try {
        const renderAccount = {
          ...account,
          custom: {
            handle: carouselData.account_handle_override || '',
            da: carouselData.da || {},
            image_fit: carouselData.image_fit || 'cover'
          }
        };
        const rendered = await renderCarousel(carouselData, renderAccount, accountOutputDir);
        const publishedSlides = [];
        for (let index = 0; index < rendered.slides.length; index += 1) {
          const slidePath = rendered.slides[index];
          const published = await publishFile(slidePath, {
            pathname: `carousel-gen/${baseSlug}/${account.slug}/slide-${String(index + 1).padStart(2, '0')}.png`,
            contentType: 'image/png'
          });
          if (published) publishedSlides.push(published);
        }
        const publishedZip = rendered.zipPath
          ? await publishFile(rendered.zipPath, {
              pathname: `carousel-gen/${baseSlug}/${account.slug}/carousel.zip`,
              contentType: 'application/zip'
            })
          : null;
        const status = rendered.errors.length > 0 ? 'partial' : 'done';
        const id = insertCarousel({
          coverTitle: carouselData.cover_title,
          accountSlug: account.slug,
          zipPath: rendered.zipPath,
          slidesCount: rendered.slides.length,
          status
        });

        results.push({
          id,
          account_slug: account.slug,
          account_name: account.name,
          zip_path: rendered.zipPath,
          slide_paths: rendered.slides,
          zip_url: publishedZip?.url || null,
          download_url: publishedZip?.downloadUrl || publishedZip?.url || null,
          slide_urls: publishedSlides.map((item) => item.url),
          slide_file_ids: publishedSlides.map((item) => item.id),
          zip_file_id: publishedZip?.id || null,
          slides_count: rendered.slides.length,
          status,
          errors: rendered.errors
        });

        if (rendered.errors.length > 0) {
          errorLog.push(`${account.slug}: ${rendered.errors.join(' | ')}`);
        }
      } catch (error) {
        errorLog.push(`${account.slug}: ${error.message}`);
        results.push({
          account_slug: account.slug,
          account_name: account.name,
          status: 'error',
          errors: [error.message]
        });
      }
    }

    const generated = results.filter((item) => item.zip_path).length;
    finishRun(runId, {
      carouselsGenerated: generated,
      status: errorLog.length > 0 ? 'partial' : 'done',
      errorLog: errorLog.join('\n')
    });

    return { run_id: runId, results };
  } catch (error) {
    finishRun(runId, {
      carouselsGenerated: results.filter((item) => item.zip_path).length,
      status: 'error',
      errorLog: error.message
    });
    throw error;
  }
}

export async function generateForAllAccounts(carouselData) {
  return generateForAccounts(carouselData);
}

export const sampleCarousel = {
  cover_title: 'Sommeil de bebe',
  cover_subtitle: '3 reperes simples pour des nuits plus calmes',
  cover_image_url: '',
  cover_image_position: 'center',
  account_handle_override: '',
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
    font_family: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
    font_body: "'DM Sans', Arial, sans-serif",
    google_fonts_url: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500&display=swap',
    font_size_main: '72px',
    line_height: '1.28'
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
  cta_sub: 'Le lien de l ebook sommeil bebe est dans la bio',
  cta_image_url: '',
  cta_image_position: 'center'
};
