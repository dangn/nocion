const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const pkg = require('../package.json');

test('chat command hints do not repeat slash command names or signatures', () => {
  const participant = pkg.contributes.chatParticipants.find((item) => item.id === 'nocion.chat');
  assert.ok(participant, 'nocion chat participant is contributed');
  for (const command of participant.commands) {
    assert.doesNotMatch(command.description, new RegExp(`/${command.name}\\b`));
    assert.doesNotMatch(command.description, /^\/\w+/);
    assert.doesNotMatch(command.description, /<[^>]+>/);
  }
});

test('extension package metadata includes image assets', () => {
  assert.equal(pkg.publisher, 'Dang Nguyen');
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.icon, 'images/nocion-icon.png');
  assert.ok(pkg.files.includes('images'));
  assert.ok(pkg.files.includes('VS_CODE_README.md'));
  assert.ok(pkg.files.includes('LICENSE'));
  assert.equal(pkg.files.includes('README.md'), false);
});

test('repository and VS Code READMEs are split by audience', () => {
  const repoReadme = fs.readFileSync('README.md', 'utf8');
  const vscodeReadme = fs.readFileSync('VS_CODE_README.md', 'utf8');

  assert.match(repoReadme, /Development/);
  assert.match(repoReadme, /Repository Contents/);
  assert.match(repoReadme, /MIT License/);
  assert.doesNotMatch(vscodeReadme, /npm run/);
  assert.doesNotMatch(vscodeReadme, /source code/i);
  assert.doesNotMatch(vscodeReadme, /Development/);
  assert.doesNotMatch(vscodeReadme, /!\[Nocion icon\]/);
  assert.match(vscodeReadme, /Install/);
  assert.match(vscodeReadme, /Quick Start/);
});
