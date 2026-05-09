const { UserCancelledError } = require('../../utils/errors');

function createAtlassianCredentials(env = {}) {
  const context = env.context || {};
  const secretStore = context.secrets || createMemorySecrets();
  const globalState = context.globalState || createMemoryState();
  const vscode = env.vscode;
  const prompt = env.prompt || createVscodePrompt(vscode);

  async function getCredentials(product, sourceHint = {}) {
    const site = await getOrPromptMetadata('site', sourceHint.site, {
      prompt: 'Atlassian site URL',
      placeholder: 'https://example.atlassian.net',
      validate: validateSite
    });
    const email = await getOrPromptMetadata('email', sourceHint.email, {
      prompt: 'Atlassian account email address',
      placeholder: 'you@example.com',
      validate: validateEmail
    });
    const tokenKey = tokenSecretKey(product, site, email);
    let token = await secretStore.get(tokenKey);
    if (!token) {
      token = await prompt.input({
        prompt: `${productLabel(product)} API token`,
        placeholder: 'Paste an Atlassian API token',
        password: true
      });
      if (!token) {
        throw new UserCancelledError(`Missing ${productLabel(product)} API token.`);
      }
      await secretStore.store(tokenKey, token);
    }
    return { site, email, token, tokenKey };
  }

  async function clearToken(product, site, email) {
    await secretStore.delete(tokenSecretKey(product, site, email));
  }

  async function getOrPromptMetadata(key, hint, options) {
    const storageKey = `nocion.atlassian.${key}`;
    let value = hint || await globalState.get(storageKey);
    if (!value) {
      value = await prompt.input(options);
      if (!value) {
        throw new UserCancelledError(`Missing Atlassian ${key}.`);
      }
    }
    if (options.validate) {
      const validation = options.validate(value);
      if (validation) {
        throw new Error(validation);
      }
    }
    await globalState.update(storageKey, value);
    return value;
  }

  return {
    getCredentials,
    clearToken
  };
}

function tokenSecretKey(product, site, email) {
  const normalizedSite = String(site || '').toLowerCase().replace(/[^a-z0-9.:-]+/g, '_');
  const normalizedEmail = String(email || '').toLowerCase().replace(/[^a-z0-9@._-]+/g, '_');
  return `nocion.atlassian.${product}.${normalizedSite}.${normalizedEmail}.token`;
}

function createVscodePrompt(vscode) {
  return {
    async input(options) {
      if (!vscode || !vscode.window || !vscode.window.showInputBox) {
        return undefined;
      }
      return vscode.window.showInputBox({
        prompt: options.prompt,
        placeHolder: options.placeholder,
        password: Boolean(options.password),
        ignoreFocusOut: true,
        validateInput: options.validate
      });
    }
  };
}

function createMemorySecrets() {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key);
    },
    async store(key, value) {
      values.set(key, value);
    },
    async delete(key) {
      values.delete(key);
    }
  };
}

function createMemoryState() {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key);
    },
    async update(key, value) {
      values.set(key, value);
    }
  };
}

function validateSite(value) {
  try {
    const parsed = new URL(value);
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      return 'Use an http(s) Atlassian site URL.';
    }
    return undefined;
  } catch (_error) {
    return 'Enter a valid Atlassian site URL.';
  }
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '')) ? undefined : 'Enter a valid email address.';
}

function productLabel(product) {
  return product === 'jira' ? 'Jira' : 'Confluence';
}

module.exports = {
  createAtlassianCredentials,
  tokenSecretKey,
  createMemorySecrets,
  createMemoryState,
  validateSite,
  validateEmail
};
