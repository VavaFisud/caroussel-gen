export function templateFromPrompt(prompt, overrides = {}) {
  const text = String(prompt || '').trim();
  const lines = text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const referenceIndex = lines.findIndex((line) => /^reference style notes\s*:/i.test(line));
  const contentLines = referenceIndex >= 0 ? lines.slice(0, referenceIndex) : lines;

  const topic = contentLines[0] || text.split(/[.!?]/)[0] || 'Carousel Instagram';
  const cleanTopic = topic.replace(/^sujet\s*:\s*/i, '').slice(0, 90);
  const requestedSlides = Number(overrides.slides_count || 5);
  const contentCount = Math.min(Math.max(requestedSlides - 2, 1), 5);
  const sourceLines = contentLines.slice(1);

  const slides = Array.from({ length: contentCount }, (_, index) => {
    const source = sourceLines[index] || '';
    if (source.includes(':')) {
      const [title, ...body] = source.split(':');
      return {
        title: title.trim(),
        body: body.join(':').trim(),
        image_url: '',
        image_position: 'center',
        elements: []
      };
    }

    return {
      title: source || `Point ${index + 1}`,
      body: source || `Developpe ce point avec un conseil concret et facile a appliquer.`,
      image_url: '',
      image_position: 'center',
      elements: []
    };
  });

  return {
    cover_title: overrides.cover_title || cleanTopic,
    cover_subtitle: overrides.cover_subtitle || 'Un carousel clair, pret a publier',
    cover_image_url: overrides.cover_image_url || '',
    cover_image_position: overrides.cover_image_position || 'center',
    account_handle_override: overrides.account_handle_override || '',
    image_fit: overrides.image_fit || 'cover',
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
      title_font_size: '72px',
      subtitle_font_size: '42px',
      body_font_size: '72px',
      content_title_font_size: '52px',
      handle_font_size: '30px',
      font_size_main: '72px',
      line_height: '1.28',
      ...(overrides.da || {})
    },
    slides: Array.isArray(overrides.slides) ? overrides.slides.slice(0, 5) : slides,
    cta_text: overrides.cta_text || 'Lis le guide complet',
    cta_sub: overrides.cta_sub || 'Le lien de l ebook sommeil bebe est dans la bio',
    cta_image_url: overrides.cta_image_url || '',
    cta_image_position: overrides.cta_image_position || 'center',
    decorative_elements: overrides.decorative_elements || []
  };
}
