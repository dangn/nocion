const { markdown } = require('../utils/stream');
const { normalizeWikiName } = require('../wiki/slugs');

function createSwitchCommand(services) {
  async function run({ parsed, stream }) {
    const all = await services.discovery.findAllWikiRoots();
    const targetName = parsed.prompt.trim();
    if (!targetName) {
      const active = services.sessionState.getActiveWikiPath();
      markdown(stream, [
        '**Registered wikis:**',
        '',
        all.length === 0
          ? 'No wikis found. Run `/init` first.'
          : all.map((wiki) => `- ${wiki.path === active ? '**' : ''}${wiki.name}${wiki.path === active ? '**' : ''} \`${wiki.path}\``).join('\n')
      ].join('\n'));
      return { wiki: active };
    }
    const normalized = normalizeWikiName(targetName);
    const matches = all.filter((wiki) => normalizeWikiName(wiki.name) === normalized);
    if (matches.length !== 1) {
      throw new Error(matches.length === 0 ? `No wiki named "${targetName}" found.` : `Multiple wikis named "${targetName}" found.`);
    }
    services.sessionState.setActiveWikiPath(matches[0].path);
    markdown(stream, `Switched active wiki to **${matches[0].name}**.\n`);
    return { wiki: matches[0].path };
  }
  return { run };
}

module.exports = {
  createSwitchCommand
};
