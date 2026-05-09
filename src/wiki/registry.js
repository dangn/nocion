const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { normalizeWikiName } = require('./slugs');

function createRegistry(env = {}) {
  const registryPath = env.registryPath || process.env.NOCION_REGISTRY_PATH || path.join(os.homedir(), '.nocion');

  async function read() {
    try {
      const text = await fs.readFile(registryPath, 'utf8');
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return { version: 1, wikis: parsed };
      }
      return { version: 1, wikis: Array.isArray(parsed.wikis) ? parsed.wikis : [] };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { version: 1, wikis: [] };
      }
      throw error;
    }
  }

  async function write(registry) {
    await fs.mkdir(path.dirname(registryPath), { recursive: true });
    await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  }

  async function registerWiki(entry) {
    const registry = await read();
    const normalizedPath = path.resolve(entry.path);
    const next = {
      name: entry.name,
      path: normalizedPath,
      domain: entry.domain || '',
      updated: new Date().toISOString()
    };
    registry.wikis = registry.wikis.filter((wiki) => path.resolve(wiki.path) !== normalizedPath);
    registry.wikis.push(next);
    await write(registry);
    return next;
  }

  async function findByName(name) {
    const registry = await read();
    const target = normalizeWikiName(name);
    const matches = registry.wikis.filter((wiki) => normalizeWikiName(wiki.name) === target);
    if (matches.length > 1) {
      const names = matches.map((wiki) => `${wiki.name} (${wiki.path})`).join(', ');
      throw new Error(`Multiple registered wikis match "${name}": ${names}`);
    }
    return matches[0];
  }

  return {
    registryPath,
    read,
    write,
    registerWiki,
    findByName
  };
}

module.exports = {
  createRegistry
};
