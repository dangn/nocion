const path = require('path');

function resolveAllowedPath(inputPath, options = {}) {
  const baseDirs = (options.baseDirs || []).map((dir) => path.resolve(dir));
  const workspaceRoot = options.workspaceRoot ? path.resolve(options.workspaceRoot) : process.cwd();
  const raw = String(inputPath || '').trim();
  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(workspaceRoot, raw);
  if (baseDirs.length === 0) {
    return resolved;
  }
  const allowed = baseDirs.some((base) => resolved === base || resolved.startsWith(`${base}${path.sep}`));
  if (!allowed) {
    throw new Error(`Path is outside allowed roots: ${inputPath}`);
  }
  return resolved;
}

module.exports = {
  resolveAllowedPath
};
