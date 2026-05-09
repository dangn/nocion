# Nocion

Andrej Karpathy-inspired LLM Wiki in VS Code Chat.

## Install

1. Install the Nocion VSIX in VS Code.
2. Make sure GitHub Copilot Chat is available.
3. Open a workspace folder.
4. Open VS Code Chat and type `@nocion`.

## Quick Start

1. Run `@nocion /init "My Research" domain:ml`.
2. Add source files under the wiki `raw/` folder.
3. Run `@nocion /ingest #file:raw/article.md`.
4. Ask `@nocion What are the key concepts?`.

## Commands

- `/init "<name>" [path:<path>] [domain:<domain>]` - Initialize a new wiki.
- `/ingest [wiki:<name>] <#file:path|url|jira-key|jql:query|text>` - Process a source file, URL, Jira issue, Confluence page, or pasted text.
- `/query [wiki:<name>] <question>` - Search and synthesize an answer from the wiki.
- `/lint [wiki:<name>] [semantic]` - Health-check links, orphans, contradictions, and empty pages.
- `/status [wiki:<name>]` - Show page counts, cross-references, and recent activity.
- `/switch [wiki name]` - Set or list the active wiki.
- `/all <question>` - Search across all registered wikis.

You can also ask a natural-language question after `@nocion`; Nocion routes it to query automatically.

## Supported File Types

Nocion can ingest local files with these extensions:

- Markdown and text: `.md`, `.txt`, `.json`
- Web and markup: `.html`, `.htm`, `.xml`, `.rss`, `.mht`, `.mhtml`, `.rst`, `.adoc`, `.org`, `.tex`
- Documents: `.pdf`, `.docx`, `.rtf`, `.odt`
- Spreadsheets: `.xlsx`, `.csv`, `.tsv`
- Presentations: `.pptx`, `.odp`
- Books and notebooks: `.epub`, `.ipynb`

Google Docs, Sheets, and Slides URLs are not ingested directly. Export them first, then ingest the exported `.docx`, `.xlsx`, or `.pptx` file.

## Wiki Storage

Nocion creates a local markdown wiki with:

- `raw/` - Source documents.
- `wiki/` - LLM-maintained markdown pages.
- `.nocion.json` - Wiki configuration.

Registered wiki locations are tracked globally so Nocion can find them from other workspaces.

## Jira And Confluence

Nocion can ingest Jira and Confluence sources. When needed, it prompts for:

- Atlassian site URL.
- Atlassian account email address.
- Jira API token for Jira sources.
- Confluence API token for Confluence sources.

Tokens are stored in VS Code SecretStorage and are not written to wiki files or chat output.

## Examples

```text
@nocion /init "Work Notes" path:./work-wiki
@nocion /ingest #file:raw/meeting-notes.md
@nocion /ingest https://example.com/article
@nocion /ingest jira PROJ-123
@nocion /query wiki:"Work Notes" What decisions did we make?
@nocion /lint semantic
@nocion /all What do I know about transformers?
```

## Troubleshooting

- If no wiki is found, run `/init` or `/switch`.
- If Jira or Confluence access fails, check the Atlassian site URL, email address, API token, and product permissions.
- If a URL is blocked, it may point to localhost, a private network, or a non-HTTP(S) scheme.
- If a Google Workspace URL is rejected, export the document locally and ingest the exported file.
