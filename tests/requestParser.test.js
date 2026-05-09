const test = require('node:test');
const assert = require('assert');
const { parseRequest } = require('../src/chat/requestParser');

test('parses explicit slash command and key arguments', () => {
  const parsed = parseRequest({
    prompt: '/ingest wiki:"My Research" path:./wiki domain:ml #file:raw/article.md'
  });
  assert.equal(parsed.command, 'ingest');
  assert.equal(parsed.wiki, 'My Research');
  assert.equal(parsed.path, './wiki');
  assert.equal(parsed.domain, 'ml');
  assert.deepEqual(parsed.fileRefs, ['raw/article.md']);
});

test('infers query for natural language', () => {
  const parsed = parseRequest({ prompt: 'What are the key concepts?' });
  assert.equal(parsed.command, 'query');
});

test('infers ingest for URLs and Jira issue keys', () => {
  assert.equal(parseRequest({ prompt: 'https://example.com/article' }).command, 'ingest');
  assert.equal(parseRequest({ prompt: 'ingest Jira PROJ-123' }).command, 'ingest');
  assert.deepEqual(parseRequest({ prompt: 'ingest Jira PROJ-123' }).jiraKeys, ['PROJ-123']);
});
