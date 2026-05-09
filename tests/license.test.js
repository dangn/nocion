const test = require('node:test');
const assert = require('assert');
const fs = require('fs');

test('MIT license file is present with correct copyright holder', () => {
  const license = fs.readFileSync('LICENSE', 'utf8');
  assert.match(license, /^MIT License/);
  assert.match(license, /Copyright \(c\) 2026 Dang Nguyen/);
  assert.match(license, /Permission is hereby granted, free of charge/);
});
