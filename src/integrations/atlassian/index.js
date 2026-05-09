const { createAtlassianCredentials } = require('./credentials');
const { createAtlassianHttp } = require('./http');
const { createJiraClient, isJiraSource } = require('./jira');
const { createConfluenceClient, isConfluenceSource } = require('./confluence');

function createAtlassianIntegration(env = {}) {
  const credentials = createAtlassianCredentials(env);
  const http = createAtlassianHttp(env);
  const jira = createJiraClient({ ...env, credentials, http });
  const confluence = createConfluenceClient({ ...env, credentials, http });

  async function loadAtlassianSource({ source, parsed, wikiRoot, token }) {
    if (isConfluenceSource(source, parsed)) {
      return confluence.load({ source, parsed, wikiRoot, token });
    }
    if (isJiraSource(source, parsed)) {
      return jira.load({ source, parsed, wikiRoot, token });
    }
    throw new Error('Could not determine whether the Atlassian source is Jira or Confluence.');
  }

  return {
    credentials,
    http,
    jira,
    confluence,
    loadAtlassianSource
  };
}

module.exports = {
  createAtlassianIntegration
};
