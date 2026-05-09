const { createWikiStore } = require('./wiki/store');
const { createRegistry } = require('./wiki/registry');
const { createWikiDiscovery } = require('./wiki/discovery');
const { createSourceLoader } = require('./ingest/sourceLoader');
const { createLlmClient } = require('./llm/client');
const { createAtlassianIntegration } = require('./integrations/atlassian');

function createServices(env) {
  const wikiStore = createWikiStore(env);
  const registry = createRegistry(env);
  const discovery = createWikiDiscovery({ ...env, wikiStore, registry });
  const llm = createLlmClient(env);
  const atlassian = createAtlassianIntegration({ ...env, wikiStore });
  const sourceLoader = createSourceLoader({ ...env, wikiStore, atlassian });

  return {
    ...env,
    wikiStore,
    registry,
    discovery,
    llm,
    sourceLoader,
    atlassian
  };
}

module.exports = {
  createServices
};
