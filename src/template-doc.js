export const TEMPLATE_JSON_DOC = `# CarouselGen .template specification for AI agents

Your job as an AI agent is to create one valid JSON object that can be saved as a .template file and uploaded in the admin dashboard.

Return JSON only. Do not wrap the JSON in markdown. Do not add comments. Do not invent unsupported keys when a supported key exists.

## MCP workflow

If you are connected through the CarouselGen MCP server, always call the tool named get_template_documentation before drafting or saving a template.

Recommended MCP flow:
1. Call get_template_documentation.
2. If the user sent a competitor/reference image, analyze the image yourself in the host model and write detailed visual notes: canvas ratio, palette, typography, text hierarchy, spacing, annotations, arrows, images, handle, and decorative shapes.
3. Create a .template JSON manually from those notes, or call draft_template_from_prompt with prompt plus reference_notes.
4. If the user asks to store it for an account, call save_template with account_slug, template_name, and the complete template JSON.
5. If the user asks to generate a post, call generate_carousel with the selected template and account_slug.
6. If the MCP client times out on local/VPS generation, call generate_carousel with async_generation=true, then poll get_generation_job until status is done.

Important: the MCP tool does not see images by itself. Claude, ChatGPT, Poke, or the host agent must inspect the uploaded image, then pass extracted reference_notes or a completed JSON template into the MCP.

## Required top-level fields

- cover_title: string. First slide main text. Supports adaptive annotation tokens.
- cover_subtitle: string. Use " " if the visual reference has no subtitle.
- slides: array. At least one content slide.
- cta_text: string. Final slide title.
- cta_sub: string. Final slide subtitle.
- da: object. Art direction variables.

Content constraints:
- The final carousel must contain 3 to 7 slides total, including cover and CTA.
- Because cover and CTA are automatic, use 1 to 5 content slides in slides[].
- Do not create visible slide number badges such as "1/7"; Instagram already displays carousel position.
- CTA must point to the account offer: ebook/link in bio or an exact comment keyword. Do not use a generic "follow me" CTA as the final action.

## Recommended top-level fields

- account_handle_override: string, for example "@bebenuitsfaciles".
- image_fit: "cover" or "contain".
- cover_marks: adaptive annotations for cover_title or cover_subtitle.
- cta_marks: adaptive annotations for cta_text or cta_sub.
- cover_elements: decorative elements only on cover.
- cta_elements: decorative elements only on CTA.
- decorative_elements: decorative elements repeated on every slide.
- cover_image_url, cta_image_url: optional image URLs.
- cover_image_frame, cta_image_frame: optional frame object controlling image placement.

## Art direction object: da

Use explicit values. Do not rely on defaults when copying a reference image.

Supported keys:
- background_color: CSS color, usually hex.
- cta_background_color: CSS color for CTA slide.
- accent_color: CSS color used for badges/visual accents.
- text_color: CSS color for main text.
- handle_color: CSS color, rgba accepted.
- badge_bg: legacy CSS color. Do not use it to create visible number badges.
- annotation_color: CSS color fallback for marks.
- decoration_color: CSS color or rgba for top paint decoration.
- arrow_color: CSS color.
- font_family: CSS font stack for main serif/display text.
- font_body: CSS font stack for handle/UI text.
- google_fonts_url: Google Fonts CSS URL if using web fonts.
- title_font_size: CSS size like "70px".
- subtitle_font_size: CSS size.
- body_font_size: CSS size.
- content_title_font_size: CSS size.
- handle_font_size: CSS size.
- font_size_main: CSS size.
- line_height: string or number, e.g. "1.24".

## Adaptive marks

Use marks for anything attached to text: circles, ellipses, underlines.
Marks resize automatically when Gemini replaces the text with a longer or shorter segment.

Syntax inside text:
- [[token|visible text]] creates a circle mark.
- __token|visible text__ creates an underline mark.

The matching mark object must use the same token.

Mark object fields:
- kind: "circle" or "underline".
- token: stable identifier, snake_case, no spaces.
- field: target field. For cover: "cover_title" or "cover_subtitle". For content slides: "title" or "body". For CTA: "cta_text" or "cta_sub".
- text: visible segment to find if token syntax is absent.
- color: CSS color.
- strokeWidth: number in px.
- rotation: number in degrees.
- opacity: 0 to 1.
- fontSize: optional number in px if the marked text needs a custom size.

Rules:
- Always use token syntax in the text when possible.
- Never use markdown **bold** or _italic_ for visual marks.
- Do not use fixed decorative circle elements for text emphasis. Use marks instead.
- If adapting a competitor image, identify 1 or 2 emphasized phrases only.
- Prefer kind="circle" for hand-drawn circles and kind="underline" for hand-drawn underlines.
- The legacy names handdrawncircle and handdrawnunderline are accepted only in imported canvas/elements templates. In new templates, use marks with kind.

Example:
{
  "cover_title": "Un bebe avec [[pain_point|pleurs constants]] et __desired_outcome|plus longtemps__.",
  "cover_marks": [
    { "kind": "circle", "token": "pain_point", "field": "cover_title", "text": "pleurs constants", "color": "#4F666D", "strokeWidth": 5, "rotation": -3 },
    { "kind": "underline", "token": "desired_outcome", "field": "cover_title", "text": "plus longtemps", "color": "#2D3134", "strokeWidth": 6, "rotation": -1.5 }
  ]
}

## Decorative elements

Use elements for free-floating visuals not attached to a word.

Supported element types:
- arrow
- circle
- ellipse
- line
- underline
- text

Coordinate system:
- x and y are percentages of the slide, 0 to 100.
- width and height are pixels.
- rotation is degrees.
- opacity is 0 to 1.

Element fields:
- type: one supported type.
- x: number, percentage.
- y: number, percentage.
- width: number, pixels.
- height: number, pixels.
- color: CSS color.
- strokeWidth: number, pixels.
- rotation: number.
- opacity: number.
- label or text: only for type "text".
- fontFamily and fontSize: only for type "text".

Use decorative_elements for objects repeated on every slide, such as a bottom arrow.
Use cover_elements, slides[n].elements, or cta_elements for slide-specific objects.

Examples:
[
  { "type": "arrow", "x": 50, "y": 84, "width": 135, "height": 28, "color": "#FFFFFF", "strokeWidth": 3, "opacity": 0.9 },
  { "type": "circle", "x": 74, "y": 18, "width": 180, "height": 90, "color": "#344146", "strokeWidth": 4, "rotation": -8, "opacity": 0.42 },
  { "type": "underline", "x": 50, "y": 72, "width": 240, "height": 18, "color": "#2D3134", "strokeWidth": 6, "rotation": -2 },
  { "type": "text", "x": 50, "y": 92, "width": 400, "height": 48, "text": "@account", "fontSize": 30, "fontFamily": "'DM Sans', Arial, sans-serif", "color": "rgba(255,255,255,0.78)" }
]

## Images

Each slide can have:
- image_url: URL string.
- image_position: "center", "top", "bottom", "left", "right".
- image_frame: object controlling placement.

image_frame fields:
- x: center x percentage.
- y: center y percentage.
- width: percentage of slide width.
- height: percentage of slide height.
- opacity: 0 to 1.
- radius: border radius in px.

Example:
"image_frame": { "x": 50, "y": 32, "width": 80, "height": 28, "opacity": 0.32, "radius": 32 }

For web-dashboard editing, image_frame is the source of truth for drag/resize. If an image must stay in the same position when Gemini rewrites text, keep image_frame and only change image_url/text.

## Content slide object

Each item in slides supports:
- title: string. Can be empty for full-body editorial slides.
- body: string. Supports adaptive annotation tokens.
- marks: array of mark objects with field "title" or "body".
- elements: array of decorative element objects.
- image_url: optional URL.
- image_position: optional.
- image_frame: optional.

## Legacy canvas/elements import format

The dashboard and MCP can also normalize older .template files shaped like a canvas with absolute pixel elements. This exists for compatibility with templates extracted from image analysis.

Supported legacy top-level fields:
- filename: string.
- sourceMediaId: string.
- canvas: { "width": 1080, "height": 1350, "backgroundColor": "#87a8bc" }.
- typography: optional object with mainFont, mainColor, handleFont, handleColor.
- elements: array using absolute x/y pixels.

Supported legacy element examples:
[
  { "type": "text", "id": "main_text", "text": "Main slide text", "alignment": "center", "x": 540, "y": 540, "maxWidth": 760, "fontSize": 62, "lineHeight": 1.25, "fontFamily": "serif", "color": "#ffffff" },
  { "type": "annotation", "id": "circle", "style": "handdrawncircle", "targetText": "pleurs constants", "color": "#6f7c80", "strokeWidth": 6, "x": 540, "y": 650, "width": 270, "height": 95 },
  { "type": "annotation", "id": "underline", "style": "handdrawnunderline", "targetText": "plus longtemps", "color": "#2c2c2c", "strokeWidth": 6, "x": 540, "y": 830, "width": 290, "height": 22 },
  { "type": "arrow", "id": "next_arrow", "x": 540, "y": 1125, "color": "#ffffff", "strokeWidth": 5, "direction": "right" },
  { "type": "text", "id": "handle", "text": "@bebenuitsfaciles", "alignment": "center", "x": 540, "y": 1210, "fontSize": 30, "fontFamily": "sans-serif", "color": "#ffffff" }
]

Prefer the native CarouselGen format for new templates because it supports adaptive Gemini rewriting better. Use the legacy format only when converting a precise visual canvas.

## Reference-image workflow

When a user sends a competitor image:
1. Describe the visual system: canvas ratio, background, typography, hierarchy, marks, arrows, handle, spacing.
2. Choose a close but not identical palette.
3. Build da with explicit colors and font sizes.
4. Put text-attached circles/underlines into marks.
5. Put arrows or floating decoration into elements.
6. Return one JSON .template only.
7. Do not include prose before or after the JSON if the user asked for a downloadable/importable .template.

## High-quality constraints

- Keep 1080x1080 or 1080x1350 visual thinking, but do not include canvas unless converting from an imported canvas format.
- The final carousel must contain 3 to 7 slides total. Since cover and CTA are automatic, use 1 to 5 content slides in slides[].
- Use white or warm-white text on muted backgrounds.
- Use serif display fonts for editorial baby/sleep templates.
- Keep text large enough: cover title/body usually 62-76px.
- Keep line_height around 1.20-1.30 for large serif text.
- Avoid more than two marks per slide.
- Avoid random clipart.
- Avoid generic AI gradients.
- Avoid emojis.

## Full example

{
  "cover_title": "Un bebe de 4 semaines epuise, dormant seulement 8-12 heures par jour, avec des [[circle_pleurs|pleurs constants]] aux heures de sieste, et luttant pour dormir __underline_longtemps|plus longtemps__.",
  "cover_subtitle": " ",
  "account_handle_override": "@bebenuitsfaciles",
  "image_fit": "cover",
  "da": {
    "background_color": "#83AFC0",
    "cta_background_color": "#83AFC0",
    "accent_color": "#4A6270",
    "text_color": "#FFFFFF",
    "handle_color": "rgba(255,255,255,0.78)",
    "badge_bg": "#4A6270",
    "annotation_color": "#344146",
    "decoration_color": "rgba(175,210,220,0.38)",
    "arrow_color": "#FFFFFF",
    "font_family": "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
    "font_body": "'DM Sans', Arial, sans-serif",
    "google_fonts_url": "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500&display=swap",
    "title_font_size": "70px",
    "subtitle_font_size": "36px",
    "body_font_size": "70px",
    "content_title_font_size": "48px",
    "handle_font_size": "30px",
    "font_size_main": "70px",
    "line_height": "1.24"
  },
  "cover_marks": [
    { "kind": "circle", "token": "circle_pleurs", "field": "cover_title", "text": "pleurs constants", "color": "#4F666D", "strokeWidth": 5, "rotation": -3, "opacity": 0.95 },
    { "kind": "underline", "token": "underline_longtemps", "field": "cover_title", "text": "plus longtemps", "color": "#2D3134", "strokeWidth": 6, "rotation": -1.5, "opacity": 1 }
  ],
  "slides": [
    {
      "title": "",
      "body": "Le besoin principal n'est pas de forcer une routine. C'est de reduire la dette de sommeil avec des [[simple|reperes tres simples]].",
      "marks": [
        { "kind": "circle", "token": "simple", "field": "body", "text": "reperes tres simples", "color": "#4F666D", "strokeWidth": 4, "rotation": -2 }
      ],
      "elements": [],
      "image_url": "",
      "image_position": "center"
    }
  ],
  "cta_text": "Tu veux le plan complet ?",
  "cta_sub": "Telecharge l'ebook sommeil bebe via le lien en bio",
  "decorative_elements": [
    { "type": "arrow", "x": 50, "y": 84, "width": 135, "height": 28, "color": "#FFFFFF", "strokeWidth": 3, "opacity": 0.9 }
  ]
}`;
