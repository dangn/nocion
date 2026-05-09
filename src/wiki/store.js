const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const { makePage } = require('./frontmatter');

function createWikiStore(env = {}) {
  const workspaceFolders = () => {
    if (env.workspaceFolders) {
      return env.workspaceFolders;
    }
    const vscode = env.vscode;
    return vscode && vscode.workspace && vscode.workspace.workspaceFolders
      ? vscode.workspace.workspaceFolders.map((folder) => folder.uri.fsPath)
      : [];
  };

  function defaultWorkspaceRoot() {
    return workspaceFolders()[0] || process.cwd();
  }

  function resolveUserPath(inputPath) {
    const raw = String(inputPath || '').trim();
    if (!raw) {
      return defaultWorkspaceRoot();
    }
    if (raw === '~') {
      return os.homedir();
    }
    if (raw.startsWith('~/')) {
      return path.join(os.homedir(), raw.slice(2));
    }
    if (path.isAbsolute(raw)) {
      return path.normalize(raw);
    }
    return path.resolve(defaultWorkspaceRoot(), raw);
  }

  async function exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
  }

  async function readText(filePath, fallback) {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if (fallback !== undefined && error.code === 'ENOENT') {
        return fallback;
      }
      throw error;
    }
  }

  async function writeTextAtomic(filePath, content) {
    await ensureDir(path.dirname(filePath));
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, content, 'utf8');
    await fs.rename(tempPath, filePath);
  }

  async function appendText(filePath, content) {
    await ensureDir(path.dirname(filePath));
    await fs.appendFile(filePath, content, 'utf8');
  }

  async function createWiki(root, options) {
    const wikiDir = path.join(root, 'wiki');
    const dirs = [
      path.join(root, 'raw'),
      wikiDir,
      path.join(wikiDir, 'entities'),
      path.join(wikiDir, 'concepts'),
      path.join(wikiDir, 'sources'),
      path.join(wikiDir, 'synthesis')
    ];
    for (const dir of dirs) {
      await ensureDir(dir);
    }

    const config = {
      version: 1,
      name: options.name,
      domain: options.domain || '',
      created: new Date().toISOString(),
      layout: {
        raw: 'raw',
        wiki: 'wiki'
      }
    };
    await writeTextAtomic(path.join(root, '.nocion.json'), `${JSON.stringify(config, null, 2)}\n`);

    await writeIfMissing(path.join(wikiDir, 'index.md'), makePage({
      title: `${options.name} Index`,
      type: 'index',
      body: 'No sources have been ingested yet.'
    }));
    await writeIfMissing(path.join(wikiDir, 'overview.md'), makePage({
      title: `${options.name} Overview`,
      type: 'overview',
      body: 'This overview will be maintained as sources are ingested.'
    }));
    await writeIfMissing(path.join(wikiDir, 'log.md'), makePage({
      title: `${options.name} Log`,
      type: 'log',
      body: '## Operations\n'
    }));

    return config;
  }

  async function writeIfMissing(filePath, content) {
    if (!(await exists(filePath))) {
      await writeTextAtomic(filePath, content);
    }
  }

  async function readConfig(root) {
    const text = await readText(path.join(root, '.nocion.json'));
    return JSON.parse(text);
  }

  async function listMarkdownPages(root) {
    const wikiDir = path.join(root, 'wiki');
    if (!(await exists(wikiDir))) {
      return [];
    }
    const pages = [];
    await walk(wikiDir, async (filePath) => {
      if (filePath.endsWith('.md')) {
        const relPath = path.relative(wikiDir, filePath).replace(/\\/g, '/');
        pages.push({
          absPath: filePath,
          relPath,
          content: await readText(filePath, '')
        });
      }
    });
    pages.sort((a, b) => a.relPath.localeCompare(b.relPath));
    return pages;
  }

  async function walk(dir, onFile) {
    if (!fsSync.existsSync(dir)) {
      return;
    }
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, onFile);
      } else if (entry.isFile()) {
        await onFile(full);
      }
    }
  }

  async function updateIndex(root) {
    const pages = (await listMarkdownPages(root)).filter((page) => page.relPath !== 'index.md');
    const body = pages.length === 0
      ? 'No pages yet.'
      : pages.map((page) => `- [[${page.relPath.replace(/\.md$/, '')}]]`).join('\n');
    await writeTextAtomic(path.join(root, 'wiki', 'index.md'), makePage({
      title: 'Index',
      type: 'index',
      body
    }));
  }

  return {
    workspaceFolders,
    defaultWorkspaceRoot,
    resolveUserPath,
    exists,
    ensureDir,
    readText,
    writeTextAtomic,
    appendText,
    createWiki,
    readConfig,
    listMarkdownPages,
    updateIndex
  };
}

module.exports = {
  createWikiStore
};
