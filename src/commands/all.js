const path = require('path');
const { markdown, progress } = require('../utils/stream');
const { fallbackSelect } = require('./query');

function createAllCommand(services) {
  async function run({ parsed, stream }) {
    const question = parsed.prompt || parsed.rawPrompt;
    const wikis = await services.discovery.findAllWikiRoots();
    if (wikis.length === 0) {
      markdown(stream, 'No Nocion wikis found. Run `/init` first.\n');
      return {};
    }
    progress(stream, `Searching ${wikis.length} wiki(s)...`);
    const sections = [];
    for (const wiki of wikis) {
      const pages = await services.wikiStore.listMarkdownPages(wiki.path);
      const selected = fallbackSelect(question, pages).slice(0, 5);
      if (selected.length === 0) {
        continue;
      }
      sections.push(`## ${wiki.name}\n\n${selected.map((rel) => `- [[${wiki.name}:${rel.replace(/\.md$/, '')}]]`).join('\n')}`);
    }
    markdown(stream, sections.length ? sections.join('\n\n') : 'No relevant pages found across registered wikis.\n');
    return { wiki: wikis.map((wiki) => path.basename(wiki.path)).join(',') };
  }
  return { run };
}

module.exports = {
  createAllCommand
};
