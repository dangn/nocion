const test = require('node:test');
const assert = require('assert');
const path = require('path');
const { createServices } = require('../src/services');
const { createInitCommand } = require('../src/commands/init');
const { createStatusCommand } = require('../src/commands/status');
const { createSwitchCommand } = require('../src/commands/switch');
const { parseRequest } = require('../src/chat/requestParser');
const { tempWorkspace, createStream } = require('./helpers');

test('init creates a wiki, registers it, status reports it, and switch selects it', async () => {
  const workspace = await tempWorkspace('wiki-lifecycle');
  const services = createServices({
    workspaceFolders: [workspace.root],
    registryPath: workspace.registryPath,
    sessionState: {
      active: undefined,
      getActiveWikiPath() { return this.active; },
      setActiveWikiPath(value) { this.active = value; }
    }
  });

  const init = createInitCommand(services);
  const initStream = createStream();
  await init.run({
    parsed: parseRequest({ prompt: '/init "Research" path:./research domain:ml' }),
    stream: initStream
  });

  const wikiRoot = path.join(workspace.root, 'research');
  assert.equal(await services.wikiStore.exists(path.join(wikiRoot, '.nocion.json')), true);
  assert.equal(services.sessionState.getActiveWikiPath(), wikiRoot);

  const status = createStatusCommand(services);
  const statusStream = createStream();
  await status.run({ parsed: parseRequest({ prompt: '/status' }), stream: statusStream });
  assert.match(statusStream.text(), /Pages: 3/);

  services.sessionState.setActiveWikiPath(undefined);
  const switchCommand = createSwitchCommand(services);
  const switchStream = createStream();
  await switchCommand.run({ parsed: parseRequest({ prompt: '/switch Research' }), stream: switchStream });
  assert.equal(services.sessionState.getActiveWikiPath(), wikiRoot);
});
