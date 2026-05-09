const fs = require('fs/promises');
const path = require('path');
const { normalizeWikiName } = require('./slugs');

function createWikiDiscovery({ wikiStore, registry, sessionState }) {
  async function findWikiRoot(parsed = {}) {
    if (parsed.wiki) {
      const all = await findAllWikiRoots();
      const target = normalizeWikiName(parsed.wiki);
      const matches = all.filter((wiki) => normalizeWikiName(wiki.name) === target);
      if (matches.length === 1) {
        return matches[0].path;
      }
      if (matches.length > 1) {
        throw new Error(`Multiple wikis match "${parsed.wiki}". Use a more specific name.`);
      }
      const registered = await registry.findByName(parsed.wiki);
      if (registered) {
        return registered.path;
      }
      throw new Error(`No wiki named "${parsed.wiki}" was found.`);
    }

    if (sessionState && sessionState.getActiveWikiPath()) {
      const active = sessionState.getActiveWikiPath();
      if (await isWikiRoot(active)) {
        return active;
      }
    }

    for (const root of wikiStore.workspaceFolders()) {
      if (await isWikiRoot(root)) {
        return root;
      }
    }

    const first = wikiStore.workspaceFolders()[0];
    if (first) {
      const subdirs = await safeReaddir(first);
      for (const entry of subdirs) {
        const full = path.join(first, entry.name);
        if (entry.isDirectory() && await isWikiRoot(full)) {
          return full;
        }
      }
    }

    const all = await findAllWikiRoots();
    if (all.length === 1) {
      return all[0].path;
    }
    if (all.length > 1) {
      throw new Error(`Multiple Nocion wikis were found. Use /switch or wiki:name to choose one.`);
    }
    throw new Error('No Nocion wiki found. Run /init first.');
  }

  async function findAllWikiRoots() {
    const candidates = [];
    for (const root of wikiStore.workspaceFolders()) {
      candidates.push(root);
    }
    const first = wikiStore.workspaceFolders()[0];
    if (first) {
      for (const entry of await safeReaddir(first)) {
        if (entry.isDirectory()) {
          candidates.push(path.join(first, entry.name));
        }
      }
    }
    const registered = await registry.read();
    for (const wiki of registered.wikis) {
      candidates.push(wiki.path);
    }

    const deduped = new Map();
    for (const candidate of candidates) {
      const resolved = path.resolve(candidate);
      if (deduped.has(resolved)) {
        continue;
      }
      if (await isWikiRoot(resolved)) {
        let name = path.basename(resolved);
        let domain = '';
        try {
          const config = await wikiStore.readConfig(resolved);
          name = config.name || name;
          domain = config.domain || '';
        } catch (_error) {}
        deduped.set(resolved, { name, path: resolved, domain });
      }
    }
    return [...deduped.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async function isWikiRoot(root) {
    return wikiStore.exists(path.join(root, '.nocion.json'));
  }

  async function safeReaddir(dir) {
    try {
      return await fs.readdir(dir, { withFileTypes: true });
    } catch (_error) {
      return [];
    }
  }

  return {
    findWikiRoot,
    findAllWikiRoots,
    isWikiRoot
  };
}

module.exports = {
  createWikiDiscovery
};
