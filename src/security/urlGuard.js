const dns = require('dns/promises');
const net = require('net');

const PRIVATE_HOSTS = new Set(['localhost', 'localhost.localdomain']);

function isPrivateHostname(hostname) {
  const host = String(hostname || '').toLowerCase();
  return PRIVATE_HOSTS.has(host) || host.endsWith('.localhost');
}

function isPrivateIp(address) {
  if (!address) {
    return true;
  }
  if (net.isIPv4(address)) {
    const parts = address.split('.').map(Number);
    return parts[0] === 10
      || parts[0] === 127
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
      || (parts[0] === 169 && parts[1] === 254)
      || parts[0] === 0;
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    return lower === '::1'
      || lower.startsWith('fc')
      || lower.startsWith('fd')
      || lower.startsWith('fe80:');
  }
  return false;
}

async function validatePublicHttpUrl(input, options = {}) {
  let parsed;
  try {
    parsed = new URL(input);
  } catch (_error) {
    throw new Error(`Invalid URL: ${input}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Blocked non-HTTP URL: ${parsed.protocol}`);
  }
  if (isPrivateHostname(parsed.hostname)) {
    throw new Error(`Blocked private host: ${parsed.hostname}`);
  }
  if (net.isIP(parsed.hostname) && isPrivateIp(parsed.hostname)) {
    throw new Error(`Blocked private IP address: ${parsed.hostname}`);
  }
  if (!options.skipDns && !net.isIP(parsed.hostname)) {
    const resolver = options.resolver || dns.lookup;
    const records = await resolver(parsed.hostname, { all: true });
    for (const record of records) {
      if (isPrivateIp(record.address)) {
        throw new Error(`Blocked private DNS result for ${parsed.hostname}`);
      }
    }
  }
  return parsed;
}

function isAtlassianUrl(input) {
  try {
    const parsed = new URL(input);
    return parsed.hostname.endsWith('.atlassian.net') || parsed.hostname.endsWith('.jira.com');
  } catch (_error) {
    return false;
  }
}

module.exports = {
  validatePublicHttpUrl,
  isPrivateIp,
  isPrivateHostname,
  isAtlassianUrl
};
