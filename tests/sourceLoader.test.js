const test = require('node:test');
const assert = require('assert');
const { isUnsupportedGoogleWorkspaceUrl } = require('../src/ingest/sourceLoader');

test('Google Workspace URLs are explicitly unsupported', () => {
  assert.equal(isUnsupportedGoogleWorkspaceUrl('https://docs.google.com/document/d/abc/edit'), true);
  assert.equal(isUnsupportedGoogleWorkspaceUrl('https://docs.google.com/spreadsheets/d/abc/edit'), true);
  assert.equal(isUnsupportedGoogleWorkspaceUrl('https://docs.google.com/presentation/d/abc/edit'), true);
  assert.equal(isUnsupportedGoogleWorkspaceUrl('https://example.com/document/d/abc/edit'), false);
});
