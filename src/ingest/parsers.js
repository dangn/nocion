const path = require('path');
const zlib = require('zlib');
const { readZipEntries } = require('./zip');

function parseBuffer(buffer, sourcePath, contentType = '') {
  const ext = extensionFor(sourcePath, contentType);
  try {
    if (ext === '.rtf') {
      return parseResult(parseRtf(buffer.toString('utf8')));
    }
    if (ext === '.pdf') {
      return parseResult(parsePdf(buffer), ['PDF text extraction is best-effort and may miss complex layout text.']);
    }
    if (ext === '.docx') {
      return parseResult(parseDocx(buffer));
    }
    if (ext === '.xlsx') {
      return parseResult(parseXlsx(buffer));
    }
    if (ext === '.pptx') {
      return parseResult(parsePptx(buffer));
    }
    if (ext === '.epub') {
      return parseResult(parseEpub(buffer));
    }
    if (ext === '.odt') {
      return parseResult(parseOpenDocument(buffer, 'text'));
    }
    if (ext === '.odp') {
      return parseResult(parseOpenDocument(buffer, 'presentation'));
    }
    if (ext === '.ipynb') {
      return parseResult(parseNotebook(buffer.toString('utf8')));
    }
    if (ext === '.mht' || ext === '.mhtml') {
      return parseResult(parseMhtml(buffer.toString('utf8')));
    }

    if (isTextLike(ext, contentType)) {
      const text = buffer.toString('utf8');
      if (ext === '.html' || ext === '.htm' || contentType.includes('html')) {
        return parseResult(htmlToMarkdown(text));
      }
      if (ext === '.csv' || ext === '.tsv') {
        return parseResult(delimitedToMarkdown(text, ext === '.tsv' ? '\t' : ','));
      }
      if (ext === '.xml' || ext === '.rss' || contentType.includes('xml')) {
        return parseResult(xmlToText(text));
      }
      return parseResult(text);
    }
  } catch (error) {
    return {
      markdown: extractReadableText(buffer) || `[${ext || 'Document'} content could not be extracted.]`,
      warnings: [`Failed dedicated ${ext || 'document'} parser: ${error.message}`]
    };
  }

  return {
    markdown: extractReadableText(buffer) || `[${ext || 'Document'} content could not be extracted.]`,
    warnings: [`Unsupported file extension ${ext || '(none)'}. Used best-effort text extraction.`]
  };
}

function parseResult(markdown, warnings = []) {
  return {
    markdown: String(markdown || '').trim(),
    warnings
  };
}

function extensionFor(sourcePath, contentType) {
  const ext = path.extname(sourcePath || '').toLowerCase();
  if (ext) {
    return ext;
  }
  const type = String(contentType || '').toLowerCase();
  if (type.includes('pdf')) return '.pdf';
  if (type.includes('wordprocessingml')) return '.docx';
  if (type.includes('spreadsheetml')) return '.xlsx';
  if (type.includes('presentationml')) return '.pptx';
  if (type.includes('epub')) return '.epub';
  if (type.includes('rtf')) return '.rtf';
  if (type.includes('html')) return '.html';
  if (type.includes('csv')) return '.csv';
  if (type.includes('xml')) return '.xml';
  return ext;
}

function isTextLike(ext, contentType) {
  return [
    '.md', '.txt', '.json', '.html', '.htm', '.csv', '.tsv', '.xml',
    '.rss', '.rst', '.adoc', '.org', '.tex'
  ].includes(ext) || /^text\//i.test(contentType || '');
}

function htmlToMarkdown(html) {
  return decodeEntities(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(h1|h2|h3)>/gi, '\n\n')
    .replace(/<h1[^>]*>/gi, '# ')
    .replace(/<h2[^>]*>/gi, '## ')
    .replace(/<h3[^>]*>/gi, '### ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n'))
    .trim();
}

function delimitedToMarkdown(text, delimiter) {
  const rows = String(text || '').trim().split(/\r?\n/).filter(Boolean).map((line) => splitDelimited(line, delimiter));
  if (rows.length === 0 || rows[0].length === 0) {
    return '';
  }
  const header = rows[0];
  const body = rows.slice(1);
  return [
    `| ${header.map(cleanCell).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${header.map((_h, index) => cleanCell(row[index] || '')).join(' | ')} |`)
  ].join('\n');
}

function splitDelimited(line, delimiter) {
  if (delimiter === '\t') {
    return line.split('\t');
  }
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"' && quoted) {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function cleanCell(value) {
  return String(value).replace(/\|/g, '\\|').trim();
}

function xmlToText(text) {
  return normalizeWhitespace(decodeEntities(String(text || '')
    .replace(/<item\b/gi, '\n\n<item')
    .replace(/<entry\b/gi, '\n\n<entry')
    .replace(/<title[^>]*>([\s\S]*?)<\/title>/gi, '\n## $1\n')
    .replace(/<description[^>]*>([\s\S]*?)<\/description>/gi, '\n$1\n')
    .replace(/<summary[^>]*>([\s\S]*?)<\/summary>/gi, '\n$1\n')
    .replace(/<[^>]+>/g, ' ')));
}

function parseRtf(text) {
  return normalizeWhitespace(String(text || '')
    .replace(/\\'([0-9a-fA-F]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u(-?\d+)\??/g, (_m, value) => {
      const code = Number(value);
      return String.fromCharCode(code < 0 ? code + 65536 : code);
    })
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\line/g, '\n')
    .replace(/\\tab/g, '\t')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\\([\\{}])/g, '$1'));
}

function parseDocx(buffer) {
  const entries = readZipEntries(buffer);
  const document = entryText(entries, 'word/document.xml');
  const footnotes = optionalEntryText(entries, 'word/footnotes.xml');
  const endnotes = optionalEntryText(entries, 'word/endnotes.xml');
  return [wordXmlToText(document), wordXmlToText(footnotes), wordXmlToText(endnotes)].filter(Boolean).join('\n\n');
}

function wordXmlToText(xml) {
  return xmlBlockText(xml, ['w:p', 'w:tr', 'w:tbl']);
}

function parseXlsx(buffer) {
  const entries = readZipEntries(buffer);
  const sharedStrings = parseSharedStrings(optionalEntryText(entries, 'xl/sharedStrings.xml'));
  const sheets = workbookSheets(entries);
  const sections = [];
  for (const sheet of sheets) {
    const xml = optionalEntryText(entries, sheet.path);
    if (!xml) {
      continue;
    }
    const rows = parseSheetRows(xml, sharedStrings);
    sections.push([`## ${sheet.name}`, rowsToMarkdown(rows)].join('\n\n'));
  }
  return sections.join('\n\n');
}

function parsePptx(buffer) {
  const entries = readZipEntries(buffer);
  const slideNames = [...entries.keys()].filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(naturalSort);
  const sections = [];
  for (const slideName of slideNames) {
    const number = slideName.match(/slide(\d+)\.xml$/)[1];
    const slideText = drawingText(entryText(entries, slideName));
    const notesText = drawingText(optionalEntryText(entries, `ppt/notesSlides/notesSlide${number}.xml`));
    sections.push([
      `## Slide ${number}`,
      slideText || '(no slide text)',
      notesText ? `\n### Speaker Notes\n\n${notesText}` : ''
    ].join('\n\n').trim());
  }
  return sections.join('\n\n');
}

function parseEpub(buffer) {
  const entries = readZipEntries(buffer);
  const container = entryText(entries, 'META-INF/container.xml');
  const opfPath = attr(container, 'full-path') || [...entries.keys()].find((name) => name.endsWith('.opf'));
  const opf = entryText(entries, opfPath);
  const base = path.posix.dirname(opfPath);
  const manifest = new Map();
  for (const item of elements(opf, 'item')) {
    const id = attr(item, 'id');
    const href = attr(item, 'href');
    if (id && href) {
      manifest.set(id, path.posix.normalize(path.posix.join(base, href)));
    }
  }
  const chapters = [];
  for (const itemref of elements(opf, 'itemref')) {
    const idref = attr(itemref, 'idref');
    const chapterPath = manifest.get(idref);
    if (chapterPath && entries.has(chapterPath)) {
      chapters.push(htmlToMarkdown(entryText(entries, chapterPath)));
    }
  }
  return chapters.filter(Boolean).join('\n\n');
}

function parseOpenDocument(buffer, type) {
  const entries = readZipEntries(buffer);
  const xml = entryText(entries, 'content.xml');
  if (type === 'presentation') {
    const pages = xml.split(/<draw:page\b[^>]*>/).slice(1);
    return pages.map((page, index) => `## Slide ${index + 1}\n\n${openDocumentXmlToText(page)}`).join('\n\n');
  }
  return openDocumentXmlToText(xml);
}

function openDocumentXmlToText(xml) {
  return xmlBlockText(xml, ['text:h', 'text:p', 'text:list-item', 'table:table-row']);
}

function parseNotebook(text) {
  const notebook = JSON.parse(text);
  const language = notebook.metadata && notebook.metadata.language_info && notebook.metadata.language_info.name
    ? notebook.metadata.language_info.name
    : 'python';
  const sections = [];
  for (const cell of notebook.cells || []) {
    const source = Array.isArray(cell.source) ? cell.source.join('') : String(cell.source || '');
    if (cell.cell_type === 'markdown') {
      sections.push(source.trim());
    } else if (cell.cell_type === 'code') {
      const outputs = notebookOutputs(cell.outputs || []);
      sections.push([`\
\`\`\`${language}`, source.trim(), '```', outputs].filter(Boolean).join('\n'));
    }
  }
  return sections.filter(Boolean).join('\n\n');
}

function notebookOutputs(outputs) {
  const lines = [];
  for (const output of outputs) {
    if (output.text) {
      lines.push(Array.isArray(output.text) ? output.text.join('') : String(output.text));
    }
    if (output.data && output.data['text/plain']) {
      const value = output.data['text/plain'];
      lines.push(Array.isArray(value) ? value.join('') : String(value));
    }
    if (output.ename || output.evalue) {
      lines.push(`${output.ename || 'Error'}: ${output.evalue || ''}`.trim());
    }
  }
  return lines.length ? `\nOutput:\n${lines.join('\n').trim()}` : '';
}

function parseMhtml(text) {
  const boundaryMatch = text.match(/boundary="?([^"\r\n;]+)"?/i);
  if (!boundaryMatch) {
    return htmlToMarkdown(text);
  }
  const boundary = boundaryMatch[1];
  const parts = text.split(`--${boundary}`).map(parseMimePart).filter(Boolean);
  const htmlPart = parts.find((part) => /html/i.test(part.contentType));
  const textPart = parts.find((part) => /^text\/plain/i.test(part.contentType));
  if (htmlPart) {
    return htmlToMarkdown(htmlPart.body);
  }
  return textPart ? textPart.body.trim() : '';
}

function parseMimePart(part) {
  const trimmed = part.trim();
  if (!trimmed || trimmed === '--') {
    return undefined;
  }
  const split = trimmed.search(/\r?\n\r?\n/);
  if (split === -1) {
    return undefined;
  }
  const headers = trimmed.slice(0, split);
  const rawBody = trimmed.slice(split).replace(/^\r?\n\r?\n?/, '');
  const contentType = header(headers, 'content-type') || 'text/plain';
  const encoding = (header(headers, 'content-transfer-encoding') || '').toLowerCase();
  return {
    contentType,
    body: decodeMimeBody(rawBody, encoding)
  };
}

function parsePdf(buffer) {
  const source = buffer.toString('latin1');
  const chunks = [];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamPattern.exec(source)) !== null) {
    const dict = source.slice(Math.max(0, match.index - 400), match.index);
    let data = Buffer.from(match[1], 'latin1');
    if (/\/FlateDecode\b/.test(dict)) {
      try {
        data = zlib.inflateSync(data);
      } catch (_error) {
        try {
          data = zlib.inflateRawSync(data);
        } catch (__error) {}
      }
    }
    chunks.push(extractPdfTextOperators(data.toString('latin1')));
  }
  if (chunks.some(Boolean)) {
    return normalizeWhitespace(chunks.join('\n'));
  }
  return normalizeWhitespace(extractPdfStrings(source).join(' '));
}

function extractPdfTextOperators(content) {
  const text = [];
  const literalPattern = /\((?:\\.|[^\\)])*\)\s*Tj/g;
  let match;
  while ((match = literalPattern.exec(content)) !== null) {
    text.push(unescapePdfString(match[0].replace(/\s*Tj$/, '')));
  }
  const arrayPattern = /\[((?:\s*(?:\((?:\\.|[^\\)])*\)|-?\d+(?:\.\d+)?))*\s*)\]\s*TJ/g;
  while ((match = arrayPattern.exec(content)) !== null) {
    text.push(extractPdfStrings(match[1]).join(''));
  }
  return text.join('\n');
}

function extractPdfStrings(text) {
  const strings = [];
  const pattern = /\((?:\\.|[^\\)])*\)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    strings.push(unescapePdfString(match[0]));
  }
  return strings;
}

function unescapePdfString(value) {
  return String(value || '')
    .replace(/^\(|\)$/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\(\d{1,3})/g, (_m, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function workbookSheets(entries) {
  const workbook = optionalEntryText(entries, 'xl/workbook.xml');
  const rels = parseRelationships(optionalEntryText(entries, 'xl/_rels/workbook.xml.rels'));
  const sheets = [];
  for (const sheet of elements(workbook, 'sheet')) {
    const name = attr(sheet, 'name') || `Sheet ${sheets.length + 1}`;
    const rid = attr(sheet, 'r:id');
    const target = rels.get(rid);
    if (target) {
      sheets.push({ name, path: path.posix.normalize(path.posix.join('xl', target)) });
    }
  }
  if (sheets.length) {
    return sheets;
  }
  return [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort(naturalSort)
    .map((sheetPath, index) => ({ name: `Sheet ${index + 1}`, path: sheetPath }));
}

function parseRelationships(xml) {
  const rels = new Map();
  for (const rel of elements(xml, 'Relationship')) {
    const id = attr(rel, 'Id');
    const target = attr(rel, 'Target');
    if (id && target) {
      rels.set(id, target);
    }
  }
  return rels;
}

function parseSharedStrings(xml) {
  return elements(xml, 'si').map((si) => xmlTextByTag(si, 't'));
}

function parseSheetRows(xml, sharedStrings) {
  const rows = [];
  for (const rowXml of elements(xml, 'row')) {
    const cells = [];
    for (const cellXml of elements(rowXml, 'c')) {
      const ref = attr(cellXml, 'r');
      const col = ref ? columnIndex(ref.replace(/\d+/g, '')) : cells.length;
      cells[col] = sheetCellValue(cellXml, sharedStrings);
    }
    rows.push(cells);
  }
  return rows;
}

function sheetCellValue(cellXml, sharedStrings) {
  const type = attr(cellXml, 't');
  if (type === 's') {
    const index = Number(xmlTextByTag(cellXml, 'v'));
    return sharedStrings[index] || '';
  }
  if (type === 'inlineStr') {
    return xmlTextByTag(cellXml, 't');
  }
  return xmlTextByTag(cellXml, 'v');
}

function rowsToMarkdown(rows) {
  const nonEmpty = rows.filter((row) => row.some((cell) => String(cell || '').trim()));
  if (!nonEmpty.length) {
    return '(empty sheet)';
  }
  const width = Math.max(...nonEmpty.map((row) => row.length));
  const normalized = nonEmpty.map((row) => Array.from({ length: width }, (_v, index) => row[index] || ''));
  const header = normalized[0].map((cell, index) => cell || `Column ${index + 1}`);
  const body = normalized.slice(1);
  return [
    `| ${header.map(cleanCell).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.map(cleanCell).join(' | ')} |`)
  ].join('\n');
}

function columnIndex(column) {
  return String(column || 'A').toUpperCase().split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function drawingText(xml) {
  return elements(xml, 'a:t').map((element) => decodeEntities(stripTags(element))).filter(Boolean).join('\n');
}

function xmlBlockText(xml, blockTags) {
  let text = String(xml || '');
  for (const tag of blockTags) {
    const escaped = tag.replace(':', '\\:');
    text = text.replace(new RegExp(`<${escaped}\\b[^>]*>`, 'g'), '\n');
    text = text.replace(new RegExp(`</${escaped}>`, 'g'), '\n');
  }
  text = text
    .replace(/<w:tab\s*\/>/g, '\t')
    .replace(/<w:br\s*\/>/g, '\n')
    .replace(/<text:line-break\s*\/>/g, '\n')
    .replace(/<text:tab\s*\/>/g, '\t');
  return normalizeWhitespace(decodeEntities(stripTags(text)));
}

function xmlTextByTag(xml, tag) {
  return elements(xml, tag).map((element) => decodeEntities(stripTags(element))).join('');
}

function elements(xml, tag) {
  if (!xml) {
    return [];
  }
  const escaped = tag.replace(':', '\\:');
  const full = new RegExp(`<${escaped}\\b[^>]*>[\\s\\S]*?</${escaped}>`, 'g');
  const selfClosing = new RegExp(`<${escaped}\\b[^>]*/>`, 'g');
  return [
    ...(String(xml).match(full) || []),
    ...(String(xml).match(selfClosing) || [])
  ];
}

function attr(xml, name) {
  const escaped = name.replace(':', '\\:');
  const match = String(xml || '').match(new RegExp(`\\s${escaped}="([^"]*)"`, 'i'));
  return match ? decodeEntities(match[1]) : undefined;
}

function stripTags(text) {
  return String(text || '').replace(/<[^>]+>/g, ' ');
}

function entryText(entries, name) {
  const entry = entries.get(name);
  if (!entry) {
    throw new Error(`Missing ZIP entry: ${name}`);
  }
  return entry.toString('utf8');
}

function optionalEntryText(entries, name) {
  const entry = entries.get(name);
  return entry ? entry.toString('utf8') : '';
}

function header(headers, name) {
  const pattern = new RegExp(`^${name}:\\s*(.+)$`, 'im');
  const match = String(headers || '').match(pattern);
  return match ? match[1].trim() : undefined;
}

function decodeMimeBody(body, encoding) {
  if (encoding === 'base64') {
    return Buffer.from(String(body).replace(/\s+/g, ''), 'base64').toString('utf8');
  }
  if (encoding === 'quoted-printable') {
    return decodeQuotedPrintable(body);
  }
  return body;
}

function decodeQuotedPrintable(value) {
  return String(value || '')
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true });
}

function extractReadableText(buffer) {
  return buffer
    .toString('latin1')
    .replace(/[^\x09\x0a\x0d\x20-\x7e]+/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = {
  parseBuffer,
  htmlToMarkdown,
  delimitedToMarkdown,
  parseRtf,
  parsePdf,
  parseDocx,
  parseXlsx,
  parsePptx,
  parseEpub,
  parseOpenDocument,
  parseNotebook,
  parseMhtml,
  extractReadableText
};
