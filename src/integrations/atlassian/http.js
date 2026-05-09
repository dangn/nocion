const { redactSecrets } = require('../../utils/errors');

function createAtlassianHttp(env = {}) {
  const fetchImpl = env.fetch || global.fetch;

  async function request({ credentials, path, method = 'GET', body, token }) {
    if (!fetchImpl) {
      throw new Error('Fetch is not available in this VS Code runtime.');
    }
    if (token && token.isCancellationRequested) {
      throw new Error('Operation cancelled.');
    }
    const site = String(credentials.site || '').replace(/\/+$/, '');
    const url = `${site}${path}`;
    const auth = Buffer.from(`${credentials.email}:${credentials.token}`, 'utf8').toString('base64');
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error(`${response.status} from Atlassian. Check site, email, token, and product permissions.`);
    }
    if (response.status === 429) {
      throw new Error('Atlassian rate limit exceeded. Wait and try again.');
    }
    if (!response.ok) {
      const text = await safeText(response);
      throw new Error(redactSecrets(`Atlassian request failed with HTTP ${response.status}: ${text}`));
    }
    return response.json();
  }

  return {
    request
  };
}

async function safeText(response) {
  try {
    return await response.text();
  } catch (_error) {
    return '';
  }
}

module.exports = {
  createAtlassianHttp
};
