const path = require('path');
const { slugify } = require('../../wiki/slugs');

const JIRA_KEY = /\b[A-Z][A-Z0-9]+-\d+\b/;

function isJiraSource(source, parsed = {}) {
  const text = `${source || ''} ${parsed.prompt || ''}`;
  return /\/browse\/[A-Z][A-Z0-9]+-\d+/i.test(text)
    || /\bjira\b/i.test(text)
    || JIRA_KEY.test(text)
    || /\bjql:/i.test(text);
}

function createJiraClient(env) {
  async function load({ source, parsed, wikiRoot, token }) {
    const siteHint = siteFromSource(source);
    const credentials = await env.credentials.getCredentials('jira', { site: siteHint });
    await validate(credentials, token);
    const sourceText = `${source || ''} ${parsed.prompt || ''}`;
    if (/\bjql:/i.test(sourceText)) {
      const jql = sourceText.replace(/^.*\bjql:/i, '').trim();
      return loadJql(credentials, jql, wikiRoot, token);
    }
    const key = issueKeyFromSource(sourceText);
    if (!key) {
      throw new Error('No Jira issue key found. Use a Jira URL, issue key, or jql: query.');
    }
    return loadIssue(credentials, key, wikiRoot, token);
  }

  async function validate(credentials, token) {
    await env.http.request({ credentials, path: '/rest/api/3/myself', token });
  }

  async function loadIssue(credentials, key, wikiRoot, token) {
    const data = await env.http.request({
      credentials,
      path: `/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description,status,assignee,reporter,updated,comment`,
      token
    });
    const markdown = jiraIssueToMarkdown(data);
    const rawPath = await saveRaw(wikiRoot, `${key}.md`, markdown, env);
    return {
      kind: 'jira',
      title: `${key} ${field(data, 'summary') || ''}`.trim(),
      uri: `${credentials.site.replace(/\/+$/, '')}/browse/${key}`,
      format: 'jira-issue',
      markdown,
      warnings: [],
      provenance: { product: 'jira', key, rawPath }
    };
  }

  async function loadJql(credentials, jql, wikiRoot, token) {
    const data = await env.http.request({
      credentials,
      path: `/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,status,assignee,reporter,updated&maxResults=50`,
      token
    });
    const issues = Array.isArray(data.issues) ? data.issues : [];
    const markdown = [
      `# Jira JQL Results`,
      '',
      `Query: \`${jql}\``,
      '',
      ...issues.map((issue) => `- ${issue.key}: ${field(issue, 'summary') || '(no summary)'} (${field(issue, 'status.name') || 'unknown status'})`)
    ].join('\n');
    const rawPath = await saveRaw(wikiRoot, `jql-${slugify(jql)}.md`, markdown, env);
    return {
      kind: 'jira',
      title: `Jira JQL: ${jql}`,
      uri: `${credentials.site.replace(/\/+$/, '')}/issues/?jql=${encodeURIComponent(jql)}`,
      format: 'jira-jql',
      markdown,
      warnings: [],
      provenance: { product: 'jira', jql, rawPath }
    };
  }

  return {
    load,
    validate,
    loadIssue,
    loadJql
  };
}

function issueKeyFromSource(text) {
  const browse = String(text || '').match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
  if (browse) {
    return browse[1].toUpperCase();
  }
  const key = String(text || '').match(JIRA_KEY);
  return key ? key[0].toUpperCase() : undefined;
}

function siteFromSource(source) {
  try {
    const parsed = new URL(source);
    if (parsed.hostname.includes('atlassian') || parsed.hostname.includes('jira')) {
      return `${parsed.protocol}//${parsed.hostname}`;
    }
  } catch (_error) {}
  return undefined;
}

function jiraIssueToMarkdown(issue) {
  const key = issue.key || 'Jira Issue';
  const summary = field(issue, 'summary') || '';
  const status = field(issue, 'status.name') || 'unknown';
  const assignee = field(issue, 'assignee.displayName') || 'unassigned';
  const reporter = field(issue, 'reporter.displayName') || 'unknown';
  const updated = field(issue, 'updated') || '';
  return [
    `# ${key}: ${summary}`,
    '',
    `- Status: ${status}`,
    `- Assignee: ${assignee}`,
    `- Reporter: ${reporter}`,
    `- Updated: ${updated}`,
    '',
    '## Description',
    '',
    adfToText(field(issue, 'description')) || '(no description)',
    '',
    '## Comments',
    '',
    ...comments(issue).map((comment) => `- ${field(comment, 'author.displayName') || 'unknown'}: ${adfToText(comment.body)}`)
  ].join('\n');
}

function comments(issue) {
  const raw = field(issue, 'comment.comments');
  return Array.isArray(raw) ? raw : [];
}

function adfToText(value) {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(adfToText).filter(Boolean).join(' ');
  }
  if (typeof value === 'object') {
    if (value.type === 'text') {
      return value.text || '';
    }
    return adfToText(value.content);
  }
  return String(value);
}

function field(object, dotted) {
  let current = object && object.fields ? object.fields : object;
  for (const part of String(dotted).split('.')) {
    if (current == null) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

async function saveRaw(wikiRoot, filename, markdown, env) {
  const rawPath = path.join(wikiRoot, 'raw', 'atlassian', 'jira', filename);
  await env.wikiStore.writeTextAtomic(rawPath, `${markdown}\n`);
  return rawPath;
}

module.exports = {
  createJiraClient,
  isJiraSource,
  issueKeyFromSource,
  jiraIssueToMarkdown,
  adfToText
};
