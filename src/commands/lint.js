const path = require('path');
const { markdown, progress } = require('../utils/stream');
const { extractWikilinks, normalizePageRef, buildBacklinks } = require('../wiki/links');
const { semanticLintMessages } = require('../llm/prompts');

function createLintCommand(services) {
  async function run({ request, parsed, stream, token }) {
    const root = await services.discovery.findWikiRoot(parsed);
    const pages = await services.wikiStore.listMarkdownPages(root);
    const findings = structuralLint(pages);
    let output = renderFindings(findings);
    const wantsSemantic = /\bsemantic\b/i.test(parsed.prompt);
    if ((wantsSemantic || pages.length <= 50) && request && request.model && typeof request.model.sendRequest === 'function') {
      progress(stream, 'Running semantic lint...');
      try {
        const semantic = await services.llm.complete(request.model, semanticLintMessages(pages), token);
        output += `\n\n## Semantic Findings\n\n${semantic}`;
      } catch (error) {
        output += `\n\n## Semantic Findings\n\nSkipped: ${error.message}`;
      }
    }
    markdown(stream, output);
    return { wiki: root };
  }
  return { run };
}

function structuralLint(pages) {
  const pageSet = new Set(pages.map((page) => page.relPath));
  const backlinks = buildBacklinks(pages);
  const brokenLinks = [];
  const emptyPages = [];
  const missingFromIndex = [];
  const index = pages.find((page) => page.relPath === 'index.md');
  const indexedRefs = new Set(extractWikilinks(index ? index.content : '').map(normalizePageRef));

  for (const page of pages) {
    if (!page.content.replace(/^---[\s\S]*?---/, '').trim()) {
      emptyPages.push(page.relPath);
    }
    for (const link of extractWikilinks(page.content)) {
      const target = normalizePageRef(link);
      if (!pageSet.has(target)) {
        brokenLinks.push({ from: page.relPath, target });
      }
    }
    if (!['index.md', 'log.md'].includes(page.relPath) && !indexedRefs.has(page.relPath)) {
      missingFromIndex.push(page.relPath);
    }
  }

  const orphans = pages
    .filter((page) => !['index.md', 'overview.md', 'log.md'].includes(page.relPath))
    .filter((page) => !backlinks.has(page.relPath))
    .map((page) => page.relPath);

  return {
    brokenLinks,
    orphans,
    missingFromIndex,
    emptyPages
  };
}

function renderFindings(findings) {
  const groups = [
    ['Broken links', findings.brokenLinks.map((item) => `- ${item.from} -> ${item.target}`)],
    ['Orphan pages', findings.orphans.map((item) => `- ${item}`)],
    ['Pages missing from index', findings.missingFromIndex.map((item) => `- ${item}`)],
    ['Empty pages', findings.emptyPages.map((item) => `- ${item}`)]
  ];
  const lines = ['## Structural Findings'];
  let hasFindings = false;
  for (const [title, items] of groups) {
    lines.push('', `### ${title}`, '');
    if (items.length) {
      hasFindings = true;
      lines.push(...items);
    } else {
      lines.push('No issues found.');
    }
  }
  if (!hasFindings) {
    lines.unshift('No structural issues found.\n');
  }
  return lines.join('\n');
}

module.exports = {
  createLintCommand,
  structuralLint,
  renderFindings
};
