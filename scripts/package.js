const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const outFile = path.join(root, `${pkg.name}-${pkg.version}.vsix`);

const includedRoots = ['src', 'images', 'LICENSE', 'package.json'];

function collectFiles(entry, base = '') {
  const full = path.join(root, entry);
  if (!fs.existsSync(full)) {
    return [];
  }
  const stat = fs.statSync(full);
  if (stat.isFile()) {
    return [{ full, zipPath: path.posix.join('extension', base || entry) }];
  }
  const files = [];
  for (const child of fs.readdirSync(full)) {
    const rel = path.join(entry, child);
    const relBase = path.join(base || entry, child);
    files.push(...collectFiles(rel, relBase));
  }
  return files;
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

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function u16(value) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(value);
  return b;
}

function u32(value) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value >>> 0);
  return b;
}

function makeZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const data = file.data ? Buffer.from(file.data, 'utf8') : fs.readFileSync(file.full);
    const name = Buffer.from(file.zipPath.replace(/\\/g, '/'));
    const stat = file.full ? fs.statSync(file.full) : { mtime: new Date() };
    const { dosTime, dosDate } = dosDateTime(stat.mtime);
    const crc = crc32(data);

    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data
    ]);

    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name
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
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0)
  ]);
  return Buffer.concat([...localParts, central, end]);
}

const files = [
  {
    zipPath: 'extension.vsixmanifest',
    data: vsixManifest(pkg)
  },
  {
    zipPath: '[Content_Types].xml',
    data: contentTypes()
  },
  {
    full: path.join(root, 'VS_CODE_README.md'),
    zipPath: 'extension/README.md'
  },
  ...includedRoots.flatMap((entry) => collectFiles(entry))
];
fs.writeFileSync(outFile, makeZip(files));
console.log(`Created ${path.basename(outFile)} with ${files.length} files.`);

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function vsixManifest(pkg) {
  const categories = (pkg.categories || []).join(',');
  return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="${escapeXml(pkg.name)}" Version="${escapeXml(pkg.version)}" Publisher="${escapeXml(pkg.publisher)}" />
    <DisplayName>${escapeXml(pkg.displayName || pkg.name)}</DisplayName>
    <Description xml:space="preserve">${escapeXml(pkg.description || '')}</Description>
    <Tags>${escapeXml(categories)}</Tags>
    <Categories>${escapeXml(categories || 'Other')}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${escapeXml(pkg.engines && pkg.engines.vscode ? pkg.engines.vscode : '*')}" />
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
  </Assets>
</PackageManifest>
`;
}

function contentTypes() {
  return `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="ico" ContentType="image/x-icon" />
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="md" ContentType="text/markdown" />
  <Default Extension="png" ContentType="image/png" />
  <Default Extension="svg" ContentType="image/svg+xml" />
  <Default Extension="txt" ContentType="text/plain" />
  <Default Extension="vsixmanifest" ContentType="text/xml" />
  <Default Extension="xml" ContentType="text/xml" />
</Types>
`;
}
