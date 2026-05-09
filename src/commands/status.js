const path = require('path');
const { markdown } = require('../utils/stream');
const { extractWikilinks } = require('../wiki/links');

function createStatusCommand(services) {
  async function run({ parsed, stream }) {
    const root = await services.discovery.findWikiRoot(parsed);
    const pages = await services.wikiStore.listMarkdownPages(root);
    const links = pages.flatMap((page) => extractWikilinks(page.content));
    const recentLog = await services.wikiStore.readText(path.join(root, 'wiki', 'log.md'), '');
    const recent = recentLog.split(/\r?\n/).filter((line) => line.startsWith('- ')).slice(-5);
    markdown(stream, [
      `**Wiki:** ${path.basename(root)}`,
      '',
      `- Root: \`${root}\``,
      `- Pages: ${pages.length}`,
      `- Wikilinks: ${links.length}`,
      `- Recent operations: ${recent.length}`,
      '',
      recent.length > 0 ? recent.join('\n') : 'No operations logged yet.'
    ].join('\n'));
    return { wiki: root };
  }
  return { run };
}

module.exports = {
  createStatusCommand
};
