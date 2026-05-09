function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

function normalizeWikiName(value) {
  return slugify(value).replace(/-/g, '');
}

function pagePathFor(type, title) {
  const slug = slugify(title);
  if (type === 'entity') {
    return `entities/${slug}`;
  }
  if (type === 'concept') {
    return `concepts/${slug}`;
  }
  if (type === 'synthesis') {
    return `synthesis/${slug}`;
  }
  return `sources/${slug}`;
}

function ensureMarkdownExtension(value) {
  return value.endsWith('.md') ? value : `${value}.md`;
}

module.exports = {
  slugify,
  normalizeWikiName,
  pagePathFor,
  ensureMarkdownExtension
};
