import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { saveAccountDa } from './account-store.js';
import { generateForAccounts, generateForAllAccounts, validateCarouselData } from './generator.js';
import { getGenerationJob, listGenerationJobs, startGenerationJob } from './mcp-generation-jobs.js';
import { templateFromPrompt } from './prompt-template.js';
import { enrichGenerationResult } from './public-files.js';
import { listTemplatesAsync, loadStoredTemplateAsync, saveTemplateAsync } from './template-store.js';
import { normalizeTemplate } from './template-normalizer.js';
import { TEMPLATE_JSON_DOC } from './template-doc.js';

const anyObject = z.record(z.string(), z.any());

async function readTemplate(templatePath) {
  if (String(templatePath || '').startsWith('blob://')) return loadStoredTemplateAsync(templatePath);
  const resolved = path.resolve(process.cwd(), templatePath);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function responseJson(data) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

function shouldRunAsync(asyncGeneration = undefined) {
  if (process.env.VERCEL) return false;
  if (typeof asyncGeneration === 'boolean') return asyncGeneration;
  return process.env.MCP_FORCE_ASYNC_GENERATION === 'true';
}

function vercelAsyncWarning(asyncGeneration = undefined) {
  return process.env.VERCEL && asyncGeneration
    ? 'async_generation est ignore sur Vercel: le runtime serverless ne garantit pas le travail en arriere-plan. La generation est lancee en synchrone avec maxDuration=300.'
    : '';
}

async function generateResult(carouselData, accountSlug = '') {
  const result = await generateForAccounts(carouselData, {
    accountSlugs: accountSlug ? [accountSlug] : []
  });
  return enrichGenerationResult(result);
}

function generationJobResponse(label, task) {
  const job = startGenerationJob(label, task);
  return responseJson({
    ok: true,
    async: true,
    job_id: job.id,
    status: job.status,
    next_tool: 'get_generation_job',
    instructions: `Appelle get_generation_job avec job_id=${job.id} jusqu a status=done.`
  });
}

function mergeTemplateDa(template, da, handle = '') {
  template = normalizeTemplate(template);
  return {
    ...template,
    account_handle_override: handle || template.account_handle_override || '',
    da: {
      ...(template.da || {}),
      ...(da || {})
    }
  };
}

export function registerCarouselTools(server) {
  server.registerTool(
    'get_template_documentation',
    {
      title: 'Get CarouselGen template JSON documentation',
      description: 'Return the complete .template JSON specification. Use this before creating a template from an image/reference.',
      inputSchema: {}
    },
    async () => ({
      content: [
        {
          type: 'text',
          text: TEMPLATE_JSON_DOC
        }
      ]
    })
  );

  server.registerTool(
    'draft_template_from_prompt',
    {
      title: 'Draft carousel template from prompt',
      description: 'Create a carousel .template JSON draft from a plain language prompt. Use this after Claude has analyzed an image/reference and extracted style notes.',
      inputSchema: {
        prompt: z.string().describe('Plain language brief for the carousel. Lines after the first can become slide points.'),
        reference_notes: z.string().optional().describe('Visual analysis from a competitor post image: layout, colors, typography, annotations, spacing. The model should provide this after seeing the image.'),
        overrides: anyObject.optional().describe('Optional template fields to merge, including da, slides, cta_text, decorative_elements.')
      }
    },
    async ({ prompt, reference_notes = '', overrides = {} }) => {
      const fullPrompt = reference_notes ? `${prompt}\n\nReference style notes:\n${reference_notes}` : prompt;
      const template = templateFromPrompt(fullPrompt, overrides);
      return responseJson({ template });
    }
  );

  server.registerTool(
    'create_template_from_reference',
    {
      title: 'Create template from reference image analysis',
      description: 'Create and optionally save a .template after the AI has looked at a competitor image and describes what to mimic. The image itself is analyzed by the host AI, not this tool.',
      inputSchema: {
        prompt: z.string().describe('Carousel content brief.'),
        reference_notes: z.string().describe('Detailed visual notes extracted by the AI from the competitor image.'),
        account_slug: z.string().optional().describe('Account slug to save under, e.g. account-1.'),
        template_name: z.string().optional().describe('Name for saved .template file.'),
        save: z.boolean().optional().describe('Save the generated template to saved-templates/account/template.template.'),
        overrides: anyObject.optional().describe('Optional hard overrides, especially da and decorative_elements.')
      }
    },
    async ({ prompt, reference_notes, account_slug = 'global', template_name = '', save = false, overrides = {} }) => {
      const template = templateFromPrompt(`${prompt}\n\nReference style notes:\n${reference_notes}`, overrides);
      const saved_path = save ? await saveTemplateAsync({ accountSlug: account_slug, name: template_name || template.cover_title, template }) : null;
      return responseJson({ template, saved_path });
    }
  );

  server.registerTool(
    'save_template',
    {
      title: 'Save carousel template',
      description: 'Save a full carousel template JSON into saved-templates for reuse by account.',
      inputSchema: {
        account_slug: z.string().optional(),
        template_name: z.string(),
        template: anyObject
      }
    },
    async ({ account_slug = 'global', template_name, template }) => {
      template = normalizeTemplate(template);
      const errors = validateCarouselData(template);
      if (errors.length > 0) return responseJson({ ok: false, errors });
      const saved_path = await saveTemplateAsync({ accountSlug: account_slug, name: template_name, template });
      return responseJson({ ok: true, saved_path, template });
    }
  );

  server.registerTool(
    'list_saved_templates',
    {
      title: 'List saved templates',
      description: 'List templates saved by the MCP server.',
      inputSchema: {
        account_slug: z.string().optional()
      }
    },
    async ({ account_slug = '' }) => responseJson({ templates: await listTemplatesAsync(account_slug) })
  );

  server.registerTool(
    'save_account_da',
    {
      title: 'Save account art direction',
      description: 'Persist DA/colors/fonts/typography for an account JSON. Use when the user gives account DA.',
      inputSchema: {
        account_slug: z.string(),
        handle: z.string().optional(),
        da: anyObject
      }
    },
    async ({ account_slug, handle = '', da }) => {
      const account = await saveAccountDa(account_slug, da, handle);
      return responseJson({ ok: true, account });
    }
  );

  server.registerTool(
    'generate_carousel',
    {
      title: 'Generate carousel',
      description: 'Generate PNG slides and ZIPs for all configured accounts from a full carousel template JSON, or from a prompt plus overrides.',
      inputSchema: {
        template: anyObject.optional().describe('Full carousel template JSON. Preferred when exact control is needed.'),
        prompt: z.string().optional().describe('Prompt to draft a template if template is not provided.'),
        overrides: anyObject.optional().describe('Optional overrides merged into prompt-generated template.'),
        account_slug: z.string().optional().describe('Optional account slug. If omitted, generate for all accounts.'),
        async_generation: z.boolean().optional().describe('Return quickly with a job_id, then poll get_generation_job. Use this if the MCP client times out.')
      }
    },
    async ({ template, prompt, overrides = {}, account_slug = '', async_generation }) => {
      const carouselData = template || templateFromPrompt(prompt || 'Carousel Instagram', overrides);
      const normalized = normalizeTemplate(carouselData);
      const errors = validateCarouselData(normalized);
      if (errors.length > 0) return responseJson({ ok: false, errors });
      if (shouldRunAsync(async_generation)) {
        return generationJobResponse('generate_carousel', () => generateResult(normalized, account_slug));
      }
      const result = await generateResult(normalized, account_slug);
      return responseJson({ ok: true, warning: vercelAsyncWarning(async_generation) || undefined, result });
    }
  );

  server.registerTool(
    'generate_carousel_from_template',
    {
      title: 'Generate carousel from .template file',
      description: 'Read a local .template JSON file and generate PNG slides and ZIPs for all configured accounts.',
      inputSchema: {
        template_path: z.string().describe('Path to a .template JSON file, relative to the project or absolute.'),
        da: anyObject.optional().describe('Optional DA override applied before generating.'),
        handle: z.string().optional().describe('Optional handle override.'),
        account_slug: z.string().optional().describe('Optional account slug. If omitted, generate for all accounts.'),
        async_generation: z.boolean().optional().describe('Return quickly with a job_id, then poll get_generation_job. Use this if the MCP client times out.')
      }
    },
    async ({ template_path, da = {}, handle = '', account_slug = '', async_generation }) => {
      const carouselData = mergeTemplateDa(await readTemplate(template_path), da, handle);
      const errors = validateCarouselData(carouselData);
      if (errors.length > 0) return responseJson({ ok: false, errors });
      if (shouldRunAsync(async_generation)) {
        return generationJobResponse('generate_carousel_from_template', () => generateResult(carouselData, account_slug));
      }
      const result = await generateResult(carouselData, account_slug);
      return responseJson({ ok: true, warning: vercelAsyncWarning(async_generation) || undefined, result });
    }
  );

  server.registerTool(
    'get_generation_job',
    {
      title: 'Get generation job',
      description: 'Poll an async carousel generation job created with async_generation=true. Returns URLs when done.',
      inputSchema: {
        job_id: z.string()
      }
    },
    async ({ job_id }) => {
      const job = getGenerationJob(job_id);
      if (!job) return responseJson({ ok: false, error: `Job introuvable: ${job_id}` });
      return responseJson({ ok: true, job });
    }
  );

  server.registerTool(
    'list_generation_jobs',
    {
      title: 'List generation jobs',
      description: 'List recent async generation jobs.',
      inputSchema: {}
    },
    async () => responseJson({ ok: true, jobs: listGenerationJobs() })
  );

  server.registerTool(
    'generate_many_carousels',
    {
      title: 'Generate many carousels',
      description: 'Generate several posts in one call. Each item can be a full template, a saved template path, or a prompt plus overrides.',
      inputSchema: {
        items: z.array(anyObject).describe('Array of {template}, {template_path}, or {prompt, overrides}.'),
        shared_da: anyObject.optional().describe('Optional DA applied to every item.'),
        handle: z.string().optional().describe('Optional handle override applied to every item.')
      }
    },
    async ({ items, shared_da = {}, handle = '' }) => {
      const results = [];
      for (const item of items) {
        const template = item.template
          || (item.template_path ? await loadStoredTemplateAsync(item.template_path) : templateFromPrompt(item.prompt || 'Carousel Instagram', item.overrides || {}));
        const carouselData = mergeTemplateDa(template, shared_da, handle);
        const errors = validateCarouselData(carouselData);
        if (errors.length > 0) {
          results.push({ ok: false, errors, item });
          continue;
        }
        results.push({ ok: true, result: enrichGenerationResult(await generateForAllAccounts(carouselData)) });
      }
      return responseJson({ results });
    }
  );
}
