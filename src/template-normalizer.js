function px(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number}px` : fallback;
}

function findElement(template, predicate) {
  return Array.isArray(template.elements) ? template.elements.find(predicate) : null;
}

function strokeWidth(element, fallback = 3) {
  const value = Number(element.strokeWidth ?? element.stroke_width ?? element.borderWidth);
  return Number.isFinite(value) ? value : fallback;
}

function canvasElementToMark(element) {
  if (element.type !== 'annotation' || !element.targetText) return null;

  if (element.style === 'handdrawncircle') {
    return {
      kind: 'circle',
      text: String(element.targetText),
      token: element.token || element.id || '',
      color: element.color || '#3D2B1F',
      strokeWidth: strokeWidth(element, 3),
      rotation: Number.isFinite(Number(element.rotation)) ? Number(element.rotation) : -3,
      opacity: Number.isFinite(Number(element.opacity)) ? Number(element.opacity) : 1,
      fontFamily: element.fontFamily || '',
      fontSize: element.fontSize || ''
    };
  }

  if (element.style === 'handdrawnunderline') {
    return {
      kind: 'underline',
      text: String(element.targetText),
      token: element.token || element.id || '',
      color: element.color || '#3D2B1F',
      strokeWidth: strokeWidth(element, Number(element.height || 6)),
      rotation: Number.isFinite(Number(element.rotation)) ? Number(element.rotation) : -2,
      opacity: Number.isFinite(Number(element.opacity)) ? Number(element.opacity) : 1,
      fontFamily: element.fontFamily || '',
      fontSize: element.fontSize || ''
    };
  }

  return null;
}

function canvasElementToDecor(element, canvas) {
  const x = canvas.width ? (Number(element.x || canvas.width / 2) / canvas.width) * 100 : 50;
  const y = canvas.height ? (Number(element.y || canvas.height / 2) / canvas.height) * 100 : 50;
  const width = Number(element.width || 140);
  const height = Number(element.height || 28);

  if (element.type === 'arrow') {
    return {
      type: 'arrow',
      x,
      y,
      width: width || 140,
      height: height || 28,
      color: element.color || '#FFFFFF',
      strokeWidth: strokeWidth(element, 2.4),
      opacity: Number.isFinite(Number(element.opacity)) ? Number(element.opacity) : 1,
      rotation: Number.isFinite(Number(element.rotation)) ? Number(element.rotation) : (element.direction === 'left' ? 180 : 0)
    };
  }

  if (element.type === 'circle' || element.type === 'ellipse' || (element.type === 'annotation' && !element.targetText && element.style === 'handdrawncircle')) {
    return {
      kind: element.type === 'ellipse' ? 'ellipse' : 'circle',
      x,
      y,
      width,
      height,
      color: element.color || '#3D2B1F',
      strokeWidth: strokeWidth(element, 3),
      opacity: Number.isFinite(Number(element.opacity)) ? Number(element.opacity) : 1,
      rotation: Number.isFinite(Number(element.rotation)) ? Number(element.rotation) : -3
    };
  }

  if (element.type === 'line' || element.type === 'underline' || (element.type === 'annotation' && !element.targetText && element.style === 'handdrawnunderline')) {
    return {
      kind: element.type === 'line' ? 'line' : 'underline',
      x,
      y,
      width,
      height: Number(element.height || 8),
      color: element.color || '#3D2B1F',
      strokeWidth: strokeWidth(element, Number(element.height || 6)),
      opacity: Number.isFinite(Number(element.opacity)) ? Number(element.opacity) : 1,
      rotation: Number.isFinite(Number(element.rotation)) ? Number(element.rotation) : -2
    };
  }

  if (element.type === 'text') {
    return {
      kind: 'text',
      x,
      y,
      width,
      height,
      text: element.text || element.label || '',
      color: element.color || '#FFFFFF',
      opacity: Number.isFinite(Number(element.opacity)) ? Number(element.opacity) : 1,
      rotation: Number.isFinite(Number(element.rotation)) ? Number(element.rotation) : 0,
      fontFamily: element.fontFamily || '',
      fontSize: element.fontSize || ''
    };
  }

  return null;
}

export function normalizeTemplate(template) {
  if (!template?.canvas || !Array.isArray(template.elements)) {
    return template;
  }

  const canvas = template.canvas || {};
  const mainTextElement = findElement(template, (element) => element.id === 'main_text')
    || findElement(template, (element) => element.type === 'text' && element.id !== 'handle');
  const handleElement = findElement(template, (element) => element.id === 'handle');
  const annotations = template.elements.filter((element) => element.type === 'annotation');
  const floatingElements = template.elements.filter((element) => element.type !== 'text' && element.type !== 'annotation' && element.type !== 'arrow')
    .concat(template.elements.filter((element) => element.type === 'text' && element !== mainTextElement && element !== handleElement))
    .concat(annotations.filter((element) => !element.targetText));
  const arrowElements = template.elements.filter((element) => element.type === 'arrow');
  const marks = annotations
    .map((element) => canvasElementToMark(element))
    .filter(Boolean)
    .map((mark) => ({ ...mark, field: 'body' }));

  const mainText = mainTextElement?.text || 'Carousel Instagram';
  const decorativeElements = arrowElements
    .map((element) => canvasElementToDecor(element, canvas))
    .filter(Boolean);

  return {
    source_template_filename: template.filename || '',
    source_media_id: template.sourceMediaId || '',
    cover_title: mainText,
    cover_subtitle: ' ',
    cover_image_url: '',
    cover_image_position: 'center',
    account_handle_override: handleElement?.text || '',
    image_fit: 'cover',
    da: {
      background_color: canvas.backgroundColor || '#7A9BAD',
      cta_background_color: canvas.backgroundColor || '#7A9BAD',
      accent_color: '#4A6270',
      text_color: mainTextElement?.color || template.typography?.mainColor || '#FFFFFF',
      handle_color: handleElement?.color || template.typography?.handleColor || 'rgba(255,255,255,0.75)',
      badge_bg: '#4A6270',
      annotation_color: annotations[0]?.color || '#3D2B1F',
      decoration_color: 'rgba(157,189,202,0.45)',
      arrow_color: arrowElements[0]?.color || '#FFFFFF',
      bullet_icon: '✦',
      font_family: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
      font_body: "'DM Sans', Arial, sans-serif",
      google_fonts_url: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500&display=swap',
      title_font_size: px(mainTextElement?.fontSize, '62px'),
      subtitle_font_size: '34px',
      body_font_size: px(mainTextElement?.fontSize, '62px'),
      content_title_font_size: '46px',
      handle_font_size: px(handleElement?.fontSize, '30px'),
      font_size_main: px(mainTextElement?.fontSize, '62px'),
      line_height: String(mainTextElement?.lineHeight || 1.25)
    },
    slides: [
      {
        title: '',
        body: mainText,
        marks,
        image_url: '',
        image_position: 'center',
        elements: floatingElements
          .map((element) => canvasElementToDecor(element, canvas))
          .filter(Boolean)
      }
    ],
    cta_text: 'Lis le guide complet',
    cta_sub: "L'ebook sommeil bebe est dans la bio",
    cta_image_url: '',
    cta_image_position: 'center',
    decorative_elements: decorativeElements,
    notes: template.notes || []
  };
}
