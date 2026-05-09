const fs = require('fs/promises');
const path = require('path');
const { parseBuffer, htmlToMarkdown } = require('./parsers');
const { resolveAllowedPath } = require('../security/pathGuard');
const { validatePublicHttpUrl, isAtlassianUrl } = require('../security/urlGuard');
const { slugify } = require('../wiki/slugs');

function createSourceLoader(env) {
  async function loadSource({ parsed, wikiRoot, token }) {
    const prompt = parsed.prompt || '';
    if (parsed.fileRefs.length > 0) {
      return loadFile(parsed.fileRefs[0], wikiRoot);
    }
    if (parsed.urls.length > 0) {
      const url = parsed.urls[0];
      if (isUnsupportedGoogleWorkspaceUrl(url)) {
        throw new Error('Google Docs, Sheets, and Slides ingest is not supported in this version. Export the file locally and ingest the exported .docx, .xlsx, or .pptx file instead.');
      }
      if (isAtlassianUrl(url)) {
        return env.atlassian.loadAtlassianSource({ source: url, parsed, wikiRoot, token });
      }
      return loadUrl(url, wikiRoot, token);
    }
    if (parsed.jiraKeys.length > 0 && /\bjira\b/i.test(prompt)) {
      return env.atlassian.loadAtlassianSource({ source: parsed.jiraKeys[0], parsed, wikiRoot, token });
    }
    if (/\bconfluence\b/i.test(prompt)) {
      return env.atlassian.loadAtlassianSource({ source: prompt, parsed, wikiRoot, token });
    }
    return loadPastedText(prompt);
  }

  async function loadFile(fileRef, wikiRoot) {
    const workspaceRoot = env.wikiStore.defaultWorkspaceRoot();
    let filePath = resolveAllowedPath(fileRef, {
      workspaceRoot,
      baseDirs: [workspaceRoot, wikiRoot]
    });
    if (!path.isAbsolute(fileRef)) {
      const wikiRelative = path.resolve(wikiRoot, fileRef);
      if (await env.wikiStore.exists(wikiRelative)) {
        filePath = wikiRelative;
      }
    }
    const buffer = await fs.readFile(filePath);
    const parsed = parseBuffer(buffer, filePath);
    return {
      kind: 'file',
      title: path.basename(filePath),
      uri: filePath,
      format: path.extname(filePath).slice(1) || 'text',
      markdown: parsed.markdown,
      warnings: parsed.warnings,
      provenance: { path: filePath }
    };
  }

  async function loadUrl(url, wikiRoot, token) {
    const parsedUrl = await validatePublicHttpUrl(url);
    if (token && token.isCancellationRequested) {
      throw new Error('Operation cancelled.');
    }
    const response = await fetch(parsedUrl.toString(), { redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`URL redirected without a location: ${url}`);
      }
      const nextUrl = new URL(location, parsedUrl).toString();
      await validatePublicHttpUrl(nextUrl);
      return loadUrl(nextUrl, wikiRoot, token);
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || '';
    const markdown = contentType.includes('html')
      ? htmlToMarkdown(buffer.toString('utf8'))
      : parseBuffer(buffer, parsedUrl.pathname, contentType).markdown;
    const rawPath = await saveRemoteRaw(wikiRoot, parsedUrl, markdown);
    return {
      kind: 'url',
      title: titleFromMarkdown(markdown) || parsedUrl.hostname,
      uri: parsedUrl.toString(),
      format: contentType || 'remote',
      markdown,
      warnings: [],
      provenance: { url: parsedUrl.toString(), rawPath }
    };
  }

  async function saveRemoteRaw(wikiRoot, parsedUrl, markdown) {
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${slugify(parsedUrl.hostname + parsedUrl.pathname)}.md`;
    const rawPath = path.join(wikiRoot, 'raw', name);
    await env.wikiStore.writeTextAtomic(rawPath, `# ${parsedUrl.toString()}\n\n${markdown}\n`);
    return rawPath;
  }

  async function loadPastedText(text) {
    const markdown = String(text || '').trim();
    if (!markdown) {
      throw new Error('No source was provided. Use #file:, a URL, Jira/Confluence source, or pasted text.');
    }
    return {
      kind: 'text',
      title: titleFromMarkdown(markdown) || 'Pasted Text',
      uri: 'pasted-text',
      format: 'text',
      markdown,
      warnings: [],
      provenance: { kind: 'pasted-text' }
    };
  }

  return {
    loadSource,
    loadFile,
    loadUrl,
    loadPastedText
  };
}

function titleFromMarkdown(markdown) {
  const match = String(markdown || '').match(/^\s*#\s+(.+)$/m);
  return match ? match[1].trim() : undefined;
}

function isUnsupportedGoogleWorkspaceUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'docs.google.com'
      && /^\/(document|spreadsheets|presentation)\//.test(parsed.pathname);
  } catch (_error) {
    return false;
  }
}

module.exports = {
  createSourceLoader,
  titleFromMarkdown,
  isUnsupportedGoogleWorkspaceUrl
};
