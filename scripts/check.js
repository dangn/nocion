const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dirs = ['src', 'scripts', 'tests'];

function collectJsFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

function runCheck() {
  const files = dirs.flatMap((dir) => collectJsFiles(path.join(root, dir)));
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) {
      process.exit(result.status || 1);
    }
  }
  console.log(`Checked ${files.length} JavaScript files.`);
}

if (process.argv.includes('--watch')) {
  runCheck();
  console.log('Watch mode is a lightweight syntax check in this dependency-free scaffold.');
} else {
  runCheck();
}
