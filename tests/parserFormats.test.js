const test = require('node:test');
const assert = require('assert');
const { parseBuffer } = require('../src/ingest/parsers');

const textCases = [
  ['.md', '# Markdown Title\n\nMarkdown body', 'Markdown body'],
  ['.txt', 'Plain text body', 'Plain text body'],
  ['.json', '{"note":"JSON body"}', 'JSON body'],
  ['.html', '<h1>HTML Title</h1><p>HTML body</p>', 'HTML body'],
  ['.htm', '<h1>HTM Title</h1><p>HTM body</p>', 'HTM body'],
  ['.csv', 'Name,Value\nAlpha,1', '| Alpha | 1 |'],
  ['.tsv', 'Name\tValue\nBeta\t2', '| Beta | 2 |'],
  ['.xml', '<rss><channel><title>Feed</title><item><title>XML Item</title><description>XML body</description></item></channel></rss>', 'XML body'],
  ['.rss', '<rss><channel><title>Feed</title><item><title>RSS Item</title><description>RSS body</description></item></channel></rss>', 'RSS body'],
  ['.rst', 'RST body', 'RST body'],
  ['.adoc', '= AsciiDoc\n\nAsciiDoc body', 'AsciiDoc body'],
  ['.org', '* Org\nOrg body', 'Org body'],
  ['.tex', '\\section{TeX}\nTeX body', 'TeX body']
];

for (const [ext, content, expected] of textCases) {
  test(`parseBuffer supports ${ext}`, () => {
    const result = parseBuffer(Buffer.from(content, 'utf8'), `sample${ext}`);
    assert.match(result.markdown, escapeRegExp(expected));
  });
}

test('parseBuffer supports .rtf', () => {
  const result = parseBuffer(Buffer.from('{\\rtf1\\ansi RTF body\\par Next line}', 'utf8'), 'sample.rtf');
  assert.match(result.markdown, /RTF body/);
  assert.match(result.markdown, /Next line/);
});

test('parseBuffer supports .pdf with text streams', () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (PDF body) Tj ET\nendstream\nendobj\n%%EOF', 'latin1');
  const result = parseBuffer(pdf, 'sample.pdf');
  assert.match(result.markdown, /PDF body/);
});

test('parseBuffer supports .docx', () => {
  const docx = zipBuffer({
    'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>DOCX body</w:t></w:r></w:p></w:body></w:document>'
  });
  const result = parseBuffer(docx, 'sample.docx');
  assert.match(result.markdown, /DOCX body/);
  assert.deepEqual(result.warnings, []);
});

test('parseBuffer supports .xlsx', () => {
  const xlsx = zipBuffer({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Name</t></si><si><t>Value</t></si><si><t>Gamma</t></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>3</v></c></row></sheetData></worksheet>'
  });
  const result = parseBuffer(xlsx, 'sample.xlsx');
  assert.match(result.markdown, /## Data/);
  assert.match(result.markdown, /\| Gamma \| 3 \|/);
});

test('parseBuffer supports .pptx', () => {
  const pptx = zipBuffer({
    'ppt/slides/slide1.xml': '<p:sld><a:t>PPTX slide body</a:t></p:sld>',
    'ppt/notesSlides/notesSlide1.xml': '<p:notes><a:t>PPTX speaker notes</a:t></p:notes>'
  });
  const result = parseBuffer(pptx, 'sample.pptx');
  assert.match(result.markdown, /PPTX slide body/);
  assert.match(result.markdown, /PPTX speaker notes/);
});

test('parseBuffer supports .epub', () => {
  const epub = zipBuffer({
    'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>',
    'OPS/package.opf': '<package><manifest><item id="chapter1" href="chapter1.xhtml"/></manifest><spine><itemref idref="chapter1"/></spine></package>',
    'OPS/chapter1.xhtml': '<html><body><h1>Chapter</h1><p>EPUB body</p></body></html>'
  });
  const result = parseBuffer(epub, 'sample.epub');
  assert.match(result.markdown, /EPUB body/);
});

test('parseBuffer supports .odt', () => {
  const odt = zipBuffer({
    'content.xml': '<office:document-content><office:body><office:text><text:p>ODT body</text:p></office:text></office:body></office:document-content>'
  });
  const result = parseBuffer(odt, 'sample.odt');
  assert.match(result.markdown, /ODT body/);
});

test('parseBuffer supports .odp', () => {
  const odp = zipBuffer({
    'content.xml': '<office:document-content><office:body><office:presentation><draw:page><text:p>ODP slide body</text:p></draw:page></office:presentation></office:body></office:document-content>'
  });
  const result = parseBuffer(odp, 'sample.odp');
  assert.match(result.markdown, /Slide 1/);
  assert.match(result.markdown, /ODP slide body/);
});

test('parseBuffer supports .ipynb', () => {
  const notebook = {
    metadata: { language_info: { name: 'python' } },
    cells: [
      { cell_type: 'markdown', source: ['Notebook body'] },
      { cell_type: 'code', source: ['print("hello")'], outputs: [{ text: ['hello\n'] }] }
    ]
  };
  const result = parseBuffer(Buffer.from(JSON.stringify(notebook), 'utf8'), 'sample.ipynb');
  assert.match(result.markdown, /Notebook body/);
  assert.match(result.markdown, /```python/);
  assert.match(result.markdown, /hello/);
});

test('parseBuffer supports .mht and .mhtml', () => {
  const mhtml = [
    'MIME-Version: 1.0',
    'Content-Type: multipart/related; boundary="abc"',
    '',
    '--abc',
    'Content-Type: text/html',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    '<html><body><p>MHTML body</p></body></html>',
    '--abc--'
  ].join('\r\n');
  assert.match(parseBuffer(Buffer.from(mhtml, 'utf8'), 'sample.mht').markdown, /MHTML body/);
  assert.match(parseBuffer(Buffer.from(mhtml, 'utf8'), 'sample.mhtml').markdown, /MHTML body/);
});

function zipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const data = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
    const nameBuffer = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBuffer.length),
      u16(0),
      nameBuffer,
      data
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBuffer.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuffer
    ]);
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(Object.keys(entries).length),
    u16(Object.keys(entries).length),
    u32(central.length),
    u32(offset),
    u16(0)
  ]);
  return Buffer.concat([...localParts, central, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function escapeRegExp(value) {
  return new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}
