const path = require('path');
const { progress, markdown } = require('../utils/stream');
const { wrapUntrustedContent } = require('../security/untrustedContent');
const { ingestMessages } = require('../llm/prompts');
const { ensureArray } = require('../llm/json');
const { makePage } = require('../wiki/frontmatter');
const { pagePathFor } = require('../wiki/slugs');

function createIngestCommand(services) {
  async function run({ request, parsed, stream, token }) {
    const root = await services.discovery.findWikiRoot(parsed);
    progress(stream, 'Loading source...');
    const source = await services.sourceLoader.loadSource({ parsed, wikiRoot: root, token });
    for (const warning of source.warnings || []) {
      progress(stream, warning);
    }

    const wrapped = wrapUntrustedContent(source.markdown, 'SOURCE');
    if (wrapped.warning) {
      progress(stream, wrapped.warning);
    }

    const index = await services.wikiStore.readText(path.join(root, 'wiki', 'index.md'), '');
    progress(stream, 'Extracting entities, concepts, and claims...');
    const plan = await buildIngestPlan(services, request && request.model, source, wrapped.content, index, token);

    progress(stream, 'Writing wiki pages...');
    const written = await writeIngestPlan(services, root, source, plan);
    await services.wikiStore.updateIndex(root);
    await services.wikiStore.appendText(
      path.join(root, 'wiki', 'log.md'),
      `- ${new Date().toISOString()} ingested ${source.uri}; wrote ${written.length} pages\n`
    );

    markdown(stream, [
      `Ingested **${source.title}**.`,
      '',
      `Wrote ${written.length} wiki pages:`,
      ...written.map((page) => `- [[${page.replace(/\.md$/, '')}]]`)
    ].join('\n'));
    return { wiki: root };
  }
  return { run };
}

async function buildIngestPlan(services, model, source, boundedContent, index, token) {
  if (model && typeof model.sendRequest === 'function') {
    try {
      const plan = await services.llm.completeJson(model, ingestMessages(source, boundedContent, index), token);
      return normalizePlan(plan, source);
    } catch (_error) {
      return fallbackPlan(source);
    }
  }
  return fallbackPlan(source);
}

function normalizePlan(plan, source) {
  return {
    title: plan.title || source.title,
    summary: plan.summary || firstParagraph(source.markdown),
    claims: ensureArray(plan.claims).map(String),
    entities: ensureArray(plan.entities).map((item) => normalizeNamedSummary(item)).filter(Boolean),
    concepts: ensureArray(plan.concepts).map((item) => normalizeNamedSummary(item)).filter(Boolean)
  };
}

function normalizeNamedSummary(item) {
  if (!item) {
    return undefined;
  }
  if (typeof item === 'string') {
    return { name: item, summary: '' };
  }
  if (!item.name) {
    return undefined;
  }
  return { name: String(item.name), summary: String(item.summary || '') };
}

function fallbackPlan(source) {
  const words = [...new Set(String(source.markdown).match(/\b[A-Z][A-Za-z0-9-]{3,}\b/g) || [])].slice(0, 8);
  return {
    title: source.title,
    summary: firstParagraph(source.markdown),
    claims: source.markdown.split(/\n+/).filter((line) => line.trim().length > 40).slice(0, 5),
    entities: words.slice(0, 4).map((name) => ({ name, summary: `Mentioned in ${source.title}.` })),
    concepts: words.slice(4, 8).map((name) => ({ name, summary: `Concept mentioned in ${source.title}.` }))
  };
}

async function writeIngestPlan(services, root, source, plan) {
  const written = [];
  const sourceRef = pagePathFor('source', plan.title);
  const sourceRel = `${sourceRef}.md`;
  const entityRefs = plan.entities.map((entity) => pagePathFor('entity', entity.name));
  const conceptRefs = plan.concepts.map((concept) => pagePathFor('concept', concept.name));
  const related = [...entityRefs, ...conceptRefs].map((ref) => `- [[${ref}]]`).join('\n');
  const claims = plan.claims.length ? plan.claims.map((claim) => `- ${claim}`).join('\n') : '- No explicit claims extracted.';
  await writePage(services, root, sourceRel, makePage({
    title: plan.title,
    type: 'source',
    sources: [source.uri],
    body: [
      plan.summary,
      '',
      '## Key Claims',
      claims,
      '',
      '## Related',
      related || '- No related pages extracted.',
      '',
      '## Provenance',
      `- URI: ${source.uri}`,
      `- Format: ${source.format}`
    ].join('\n')
  }));
  written.push(sourceRel);

  for (const entity of plan.entities) {
    const rel = `${pagePathFor('entity', entity.name)}.md`;
    await mergePage(services, root, rel, entity.name, 'entity', sourceRef, entity.summary);
    written.push(rel);
  }
  for (const concept of plan.concepts) {
    const rel = `${pagePathFor('concept', concept.name)}.md`;
    await mergePage(services, root, rel, concept.name, 'concept', sourceRef, concept.summary);
    written.push(rel);
  }

  await updateOverview(services, root, plan, sourceRef);
  return [...new Set(written)];
}

async function mergePage(services, root, relPath, title, type, sourceRef, summary) {
  const abs = path.join(root, 'wiki', relPath);
  const existing = await services.wikiStore.readText(abs, '');
  if (existing) {
    const update = [
      existing.trim(),
      '',
      `## Update ${new Date().toISOString().slice(0, 10)}`,
      '',
      summary || `Updated from [[${sourceRef}]].`,
      '',
      `Source: [[${sourceRef}]]`,
      ''
    ].join('\n');
    await writePage(services, root, relPath, update);
    return;
  }
  await writePage(services, root, relPath, makePage({
    title,
    type,
    sources: [sourceRef],
    body: [
      summary || `Created from [[${sourceRef}]].`,
      '',
      '## Related',
      `- [[${sourceRef}]]`
    ].join('\n')
  }));
}

async function updateOverview(services, root, plan, sourceRef) {
  const overviewPath = path.join(root, 'wiki', 'overview.md');
  const existing = await services.wikiStore.readText(overviewPath, '');
  const addition = [
    existing.trim(),
    '',
    `## ${plan.title}`,
    '',
    `${plan.summary} [[${sourceRef}]]`,
    ''
  ].join('\n');
  await services.wikiStore.writeTextAtomic(overviewPath, addition);
}

async function writePage(services, root, relPath, content) {
  await services.wikiStore.writeTextAtomic(path.join(root, 'wiki', relPath), content);
}

function firstParagraph(markdown) {
  const paragraph = String(markdown || '').split(/\n\s*\n/).map((p) => p.trim()).find(Boolean);
  return paragraph ? paragraph.slice(0, 800) : 'No summary available.';
}

module.exports = {
  createIngestCommand,
  buildIngestPlan,
  fallbackPlan
};
