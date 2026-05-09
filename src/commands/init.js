const path = require('path');
const { firstQuotedOrToken } = require('../chat/requestParser');
const { markdown, progress } = require('../utils/stream');

function createInitCommand(services) {
  async function run({ parsed, stream }) {
    const name = firstQuotedOrToken(parsed.prompt) || 'Nocion Wiki';
    const root = services.wikiStore.resolveUserPath(parsed.path || `./${safeDefaultDir(name)}`);
    progress(stream, `Initializing wiki at ${root}`);
    await services.wikiStore.createWiki(root, { name, domain: parsed.domain || '' });
    await services.registry.registerWiki({ name, path: root, domain: parsed.domain || '' });
    services.sessionState.setActiveWikiPath(root);
    markdown(stream, [
      `Initialized **${name}**.`,
      '',
      '```text',
      `${path.basename(root)}/`,
      '  raw/',
      '  wiki/',
      '    index.md',
      '    overview.md',
      '    log.md',
      '    entities/',
      '    concepts/',
      '    sources/',
      '    synthesis/',
      '  .nocion.json',
      '```',
      '',
      'Next: `@nocion /ingest #file:raw/source.md`'
    ].join('\n'));
    return { wiki: root };
  }

  return { run };
}

function safeDefaultDir(name) {
  return String(name || 'wiki').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'wiki';
}

module.exports = {
  createInitCommand
};
