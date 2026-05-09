const test = require('node:test');
const assert = require('assert');
const fs = require('fs/promises');
const path = require('path');
const { createServices } = require('../src/services');
const { createInitCommand } = require('../src/commands/init');
const { createIngestCommand } = require('../src/commands/ingest');
const { createQueryCommand } = require('../src/commands/query');
const { structuralLint } = require('../src/commands/lint');
const { parseRequest } = require('../src/chat/requestParser');
const { tempWorkspace, createStream, createModel } = require('./helpers');

test('ingest writes source, entity, concept pages and query uses selected model', async () => {
  const workspace = await tempWorkspace('ingest-query');
  const sessionState = {
    active: undefined,
    getActiveWikiPath() { return this.active; },
    setActiveWikiPath(value) { this.active = value; }
  };
  const services = createServices({
    workspaceFolders: [workspace.root],
    registryPath: workspace.registryPath,
    sessionState
  });

  await createInitCommand(services).run({
    parsed: parseRequest({ prompt: '/init "Research" path:./research' }),
    stream: createStream()
  });
  const wikiRoot = path.join(workspace.root, 'research');
  const rawFile = path.join(wikiRoot, 'raw', 'attention.md');
  await fs.writeFile(rawFile, '# Attention\n\nTransformers use self-attention to mix token information.', 'utf8');

  const model = createModel([
    JSON.stringify({
      title: 'Attention',
      summary: 'Transformers use self-attention.',
      claims: ['Self-attention mixes token information.'],
      entities: [{ name: 'Transformers', summary: 'A model architecture family.' }],
      concepts: [{ name: 'Self Attention', summary: 'A mechanism for mixing token information.' }]
    }),
    JSON.stringify({ pages: ['sources/attention', 'concepts/self-attention'] }),
    'Self-attention is described in [[sources/attention]] and [[concepts/self-attention]].'
  ]);

  await createIngestCommand(services).run({
    request: { model },
    parsed: parseRequest({ prompt: '/ingest #file:raw/attention.md' }),
    stream: createStream()
  });

  assert.equal(await services.wikiStore.exists(path.join(wikiRoot, 'wiki', 'sources', 'attention.md')), true);
  assert.equal(await services.wikiStore.exists(path.join(wikiRoot, 'wiki', 'entities', 'transformers.md')), true);
  assert.equal(await services.wikiStore.exists(path.join(wikiRoot, 'wiki', 'concepts', 'self-attention.md')), true);

  const queryStream = createStream();
  await createQueryCommand(services).run({
    request: { model },
    chatContext: { history: [] },
    parsed: parseRequest({ prompt: 'What is self-attention?' }),
    stream: queryStream
  });
  assert.match(queryStream.text(), /\[\[sources\/attention\]\]/);
  assert.equal(model.calls.length, 3);

  const pages = await services.wikiStore.listMarkdownPages(wikiRoot);
  const findings = structuralLint(pages);
  assert.deepEqual(findings.brokenLinks, []);
});
