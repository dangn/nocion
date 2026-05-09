const path = require('path');
const { markdown, progress } = require('../utils/stream');
const { querySelectMessages, querySynthesisMessages } = require('../llm/prompts');
const { ensureArray } = require('../llm/json');
const { ensureMarkdownExtension } = require('../wiki/slugs');

function createQueryCommand(services) {
  async function run({ request, chatContext, parsed, stream, token }) {
    const root = await services.discovery.findWikiRoot(parsed);
    const question = parsed.prompt || parsed.rawPrompt;
    const pages = await answerQuestion({ services, root, question, request, chatContext, stream, token });
    return { wiki: root, pages };
  }
  return { run };
}

async function answerQuestion({ services, root, question, request, chatContext, stream, token }) {
  progress(stream, 'Selecting relevant wiki pages...');
  const index = await services.wikiStore.readText(path.join(root, 'wiki', 'index.md'), '');
  const allPages = await services.wikiStore.listMarkdownPages(root);
  const history = historyText(chatContext);
  const selected = await selectPages(services, request && request.model, question, index, allPages, history, token);
  if (selected.length === 0) {
    markdown(stream, 'I could not find relevant wiki pages for that question.\n');
    return [];
  }
  const selectedPages = selected
    .map((rel) => allPages.find((page) => page.relPath === ensureMarkdownExtension(rel)))
    .filter(Boolean);
  progress(stream, `Reading ${selectedPages.length} page(s)...`);

  if (request && request.model && typeof request.model.sendRequest === 'function') {
    progress(stream, 'Synthesizing answer...');
    await services.llm.streamMarkdown(
      request.model,
      querySynthesisMessages(question, selectedPages, history),
      stream,
      token
    );
  } else {
    markdown(stream, fallbackAnswer(question, selectedPages));
  }
  return selectedPages.map((page) => page.relPath);
}

async function selectPages(services, model, question, index, allPages, history, token) {
  if (model && typeof model.sendRequest === 'function') {
    try {
      const result = await services.llm.completeJson(model, querySelectMessages(question, index, history), token);
      return ensureArray(result.pages).map((page) => ensureMarkdownExtension(String(page).replace(/^wiki\//, ''))).slice(0, 10);
    } catch (_error) {}
  }
  return fallbackSelect(question, allPages);
}

function fallbackSelect(question, allPages) {
  const terms = String(question || '').toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
  const scored = allPages
    .filter((page) => page.relPath !== 'log.md')
    .map((page) => {
      const content = `${page.relPath}\n${page.content}`.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (content.includes(term) ? 1 : 0), 0);
      return { page, score };
    })
    .filter((item) => item.score > 0 || item.page.relPath === 'overview.md' || item.page.relPath === 'index.md')
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  return scored.map((item) => item.page.relPath);
}

function fallbackAnswer(question, pages) {
  const excerpts = pages.map((page) => {
    const first = page.content.split(/\n\s*\n/).find((block) => !block.startsWith('---') && !block.startsWith('#')) || page.content.slice(0, 500);
    return `- [[${page.relPath.replace(/\.md$/, '')}]]: ${first.trim().slice(0, 500)}`;
  });
  return [
    `I found ${pages.length} relevant page(s) for: **${question}**.`,
    '',
    ...excerpts
  ].join('\n');
}

function historyText(chatContext) {
  const history = chatContext && Array.isArray(chatContext.history) ? chatContext.history : [];
  return history
    .map((turn) => {
      if (turn.prompt) {
        return `User: ${turn.prompt}`;
      }
      if (turn.response) {
        return `Assistant: ${String(turn.response).slice(0, 500)}`;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .slice(-4000);
}

module.exports = {
  createQueryCommand,
  answerQuestion,
  selectPages,
  fallbackSelect
};
