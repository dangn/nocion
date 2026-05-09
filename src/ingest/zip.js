const zlib = require('zlib');

function readZipEntries(buffer) {
  const entries = new Map();
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset === -1) {
    throw new Error('Invalid ZIP container: end of central directory not found.');
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  let offset = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Invalid ZIP container: central directory is malformed.');
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + nameLength).toString('utf8');

    if (!name.endsWith('/')) {
      const dataStart = localDataOffset(buffer, localOffset);
      const compressed = buffer.slice(dataStart, dataStart + compressedSize);
      entries.set(name, inflateEntry(compressed, method));
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
}

function localDataOffset(buffer, offset) {
  if (buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error('Invalid ZIP container: local file header is malformed.');
  }
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  return offset + 30 + nameLength + extraLength;
}

function inflateEntry(buffer, method) {
  if (method === 0) {
    return buffer;
  }
  if (method === 8) {
    return zlib.inflateRawSync(buffer);
  }
  throw new Error(`Unsupported ZIP compression method: ${method}`);
}

module.exports = {
  readZipEntries
};
