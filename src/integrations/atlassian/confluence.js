const path = require('path');
const { slugify } = require('../../wiki/slugs');

function isConfluenceSource(source, parsed = {}) {
  const text = `${source || ''} ${parsed.prompt || ''}`;
  return /\bconfluence\b/i.test(text)
    || /\/wiki\//i.test(text)
    || /\/spaces\//i.test(text);
}

function createConfluenceClient(env) {
  async function load({ source, parsed, wikiRoot, token }) {
    const siteHint = siteFromSource(source);
    const credentials = await env.credentials.getCredentials('confluence', { site: siteHint });
    await validate(credentials, token);
    const pageId = pageIdFromSource(source || parsed.prompt);
    if (!pageId) {
      throw new Error('No Confluence page id found. Use a Confluence page URL.');
    }
    const page = await env.http.request({
      credentials,
      path: `/wiki/api/v2/pages/${encodeURIComponent(pageId)}?body-format=storage`,
      token
    });
    const markdown = confluencePageToMarkdown(page);
    const rawPath = await saveRaw(wikiRoot, `${pageId}-${slugify(page.title || 'page')}.md`, markdown, env);
    return {
      kind: 'confluence',
      title: page.title || `Confluence Page ${pageId}`,
      uri: `${credentials.site.replace(/\/+$/, '')}/wiki/pages/${pageId}`,
      format: 'confluence-page',
      markdown,
      warnings: [],
      provenance: { product: 'confluence', pageId, rawPath }
    };
  }

  async function validate(credentials, token) {
    await env.http.request({ credentials, path: '/wiki/api/v2/spaces?limit=1', token });
  }

  return {
    load,
    validate
  };
}

function pageIdFromSource(source) {
  const text = String(source || '');
  const pageIdMatch = text.match(/[?&]pageId=(\d+)/i) || text.match(/\/pages\/(\d+)/i);
  return pageIdMatch ? pageIdMatch[1] : undefined;
}

function siteFromSource(source) {
  try {
    const parsed = new URL(source);
    if (parsed.hostname.includes('atlassian')) {
      return `${parsed.protocol}//${parsed.hostname}`;
    }
  } catch (_error) {}
  return undefined;
}

function confluencePageToMarkdown(page) {
  const body = page && page.body && page.body.storage ? page.body.storage.value : '';
  return [
    `# ${page.title || 'Confluence Page'}`,
    '',
    htmlToText(body)
  ].join('\n');
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<ac:structured-macro[\s\S]*?<\/ac:structured-macro>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function saveRaw(wikiRoot, filename, markdown, env) {
  const rawPath = path.join(wikiRoot, 'raw', 'atlassian', 'confluence', filename);
  await env.wikiStore.writeTextAtomic(rawPath, `${markdown}\n`);
  return rawPath;
}

module.exports = {
  createConfluenceClient,
  isConfluenceSource,
  pageIdFromSource,
  confluencePageToMarkdown
};
