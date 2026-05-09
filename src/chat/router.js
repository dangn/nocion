const { parseRequest } = require('./requestParser');
const { createSessionState } = require('./sessionState');
const { createInitCommand } = require('../commands/init');
const { createStatusCommand } = require('../commands/status');
const { createSwitchCommand } = require('../commands/switch');
const { createIngestCommand } = require('../commands/ingest');
const { createQueryCommand } = require('../commands/query');
const { createLintCommand } = require('../commands/lint');
const { createAllCommand } = require('../commands/all');
const { createServices } = require('../services');

function createRouter(env) {
  const sessionState = createSessionState();
  const services = createServices({ ...env, sessionState });
  const commands = {
    init: createInitCommand(services),
    status: createStatusCommand(services),
    switch: createSwitchCommand(services),
    ingest: createIngestCommand(services),
    query: createQueryCommand(services),
    lint: createLintCommand(services),
    all: createAllCommand(services)
  };

  async function handle(request, chatContext, stream, token) {
    const parsed = parseRequest(request || {});
    const command = parsed.command || 'query';
    const handler = commands[command];
    if (!handler) {
      stream.markdown(`Unknown Nocion command: \`/${command}\`.\n`);
      return { metadata: { command, unknown: true } };
    }
    const result = await handler.run({ request, chatContext, parsed, stream, token });
    return {
      metadata: {
        command,
        wiki: result && result.wiki ? result.wiki : undefined
      }
    };
  }

  return {
    handle,
    services
  };
}

module.exports = {
  createRouter
};
