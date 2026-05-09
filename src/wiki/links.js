const path = require('path');
const { ensureMarkdownExtension } = require('./slugs');

function extractWikilinks(markdown) {
  const links = [];
  const pattern = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = pattern.exec(String(markdown || ''))) !== null) {
    links.push(match[1].trim());
  }
  return links;
}

function normalizePageRef(ref) {
  return ensureMarkdownExtension(String(ref || '').replace(/^wiki\//, '').replace(/\\/g, '/'));
}

function resolveWikilink(pageRef, fromDir = '') {
  const ref = normalizePageRef(pageRef);
  if (ref.includes('/')) {
    return ref;
  }
  return path.posix.normalize(path.posix.join(fromDir, ref));
}

function buildBacklinks(pages) {
  const backlinks = new Map();
  for (const page of pages) {
    for (const link of extractWikilinks(page.content)) {
      const target = normalizePageRef(link);
      if (!backlinks.has(target)) {
        backlinks.set(target, []);
      }
      backlinks.get(target).push(page.relPath);
    }
  }
  return backlinks;
}

module.exports = {
  extractWikilinks,
  normalizePageRef,
  resolveWikilink,
  buildBacklinks
};
