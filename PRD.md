# Nocion (Nocion)

LLM-powered personal knowledge base wiki in VS Code Chat.

Nocion implements [Andrej Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) as a VS Code ChatParticipant. Instead of RAG — where the LLM rediscovers knowledge from scratch on every question — Nocion has the LLM **incrementally build and maintain a persistent wiki**. Knowledge is compiled once and kept current, not re-derived on every query.

You curate sources, direct analysis, and ask questions. The LLM does all the writing, cross-referencing, and bookkeeping.

## Commands

Type `@nocion` in Copilot Chat, then use a slash command:

| Command | Description |
|---|---|
| `/init` | Initialize a new wiki (supports custom location via `path:`) |
| `/ingest` | Process a source file, URL, or pasted text into the wiki |
| `/query` | Search and synthesize an answer from the wiki |
| `/lint` | Health-check for broken links, orphans, contradictions |
| `/status` | Show page counts, cross-references, recent activity |
| `/switch` | Set the active wiki for this session (or list all wikis) |
| `/all` | Search across all registered wikis at once |

Or just type a natural language question — Nocion routes it to `/query` automatically (including when classified as an ingest intent, it routes directly to `/ingest`).

### Targeting a Specific Wiki

Use `wiki:` on any command to target a specific wiki by name:

```
@nocion wiki:research What are the key concepts?          # Query (no /query needed)
@nocion /query wiki:research What are the key concepts?   # Explicit /query
@nocion /ingest wiki:work-notes #file:raw/meeting.md      # Ingest into specific wiki
@nocion /status wiki:research                              # Status of specific wiki
```

Names are matched case-insensitively with dashes for spaces (e.g. `wiki:my-research` matches "My Research"). Use quotes for names with spaces: `wiki:"My Research"`.

### Switching Wikis

Use `/switch` to set the active wiki for the rest of your session:

```
@nocion /switch My Research    # Set active wiki
@nocion /switch                # List all wikis + show which is active
```

Once switched, all commands target that wiki until you switch again. The `wiki:` argument overrides the active wiki for a single command.

### Cross-Wiki Search

Use `/all` to search across every registered wiki at once:

```
@nocion /all What do I know about transformers?
```

This reads the index from every discovered wiki, selects relevant pages across all of them, and synthesizes a unified answer.

## Quick Start

1. Open a workspace folder
2. `@nocion /init "My Research" domain:ml`
3. Drop a source document into the `raw/` folder
4. `@nocion /ingest #file:raw/article.md`
5. Or ingest directly from a URL: `@nocion /ingest https://example.com/article`
6. `@nocion What are the key concepts?`

### Monorepo / Custom Location

You don't have to put the wiki at the workspace root. Use `path:` to specify where:

```
@nocion /init "My Research" path:~/research-wiki        # Home directory
@nocion /init "My Research" path:./wiki                  # Subdirectory of workspace
@nocion /init "My Research" path:/opt/shared/team-wiki   # Absolute path
```

The wiki location is saved to `~/.nocion` (a global registry), so it's automatically found from any workspace.

## How It Works

### Three Layers

```
raw/          ← Immutable source documents (you manage)
wiki/         ← LLM-generated interlinked markdown (Nocion manages)
.nocion.json    ← Wiki config and conventions
```

### Wiki Structure

```
wiki/
├── index.md        # Content catalog — pages with links and summaries
├── log.md          # Chronological record of all operations
├── overview.md     # High-level synthesis of all knowledge
├── entities/       # People, organizations, products, places
├── concepts/       # Ideas, frameworks, theories, patterns
├── sources/        # One summary page per ingested source
└── synthesis/      # Cross-cutting analysis, comparisons
```

### Wiki Discovery

`findWikiRoot()` searches for the wiki in this order:
1. Explicit `wiki:` argument (looked up by name)
2. Session-level active wiki (set via `/switch`)
3. Current workspace folder roots (checks for `.nocion.json`)
4. Immediate subdirectories of the first workspace folder
5. Global registry at `~/.nocion`

`findAllWikiRoots()` returns all wikis from sources 3-5 (deduplicated), used by `/switch` and `/all`.

### Ingest

When you ingest a source, Nocion:

1. Reads the document (from a file reference, URL, or pasted text)
2. Extracts entities, concepts, and key claims
3. Writes or merges a source summary to `wiki/sources/`
4. Creates or merges entity and concept pages with `[[wikilinks]]`
5. Merges updates into `wiki/overview.md` via LLM (not raw append)
6. Updates `wiki/index.md` and appends to `wiki/log.md`

For URLs, the fetched content is automatically converted from HTML to Markdown and saved to `raw/` for provenance. Large documents are automatically truncated to fit within the LLM's context window.

Re-ingesting the same source merges new information rather than overwriting.

A single source can touch 10-15 wiki pages. The knowledge compounds with every source you add.

#### Supported File Formats

| Format | Extensions | Notes |
|---|---|---|
| Markdown / Text | `.md`, `.txt`, `.json` | Read as-is |
| HTML | `.html`, `.htm` | Converted to Markdown via turndown |
| PDF | `.pdf` | Text extraction via pdf-parse |
| Word | `.docx` | Converted to HTML then Markdown via mammoth |
| RTF | `.rtf` | Control-word stripping with unicode support |
| Excel | `.xlsx` | Each sheet → Markdown table via ExcelJS |
| CSV | `.csv` | Parsed and converted to Markdown table |
| PowerPoint | `.pptx` | Slide text + speaker notes extracted |
| EPUB | `.epub` | Chapters extracted in spine order via jszip |
| OpenDocument Text | `.odt` | Text extraction from content.xml |
| OpenDocument Presentation | `.odp` | Slide text extraction from content.xml |
| Jupyter Notebook | `.ipynb` | Markdown + code cells with outputs (auto-detects kernel language) |
| TSV | `.tsv` | Parsed and converted to Markdown table |
| XML / RSS | `.xml` | RSS/Atom feeds parsed as articles; generic XML as text |
| MHTML | `.mht`, `.mhtml` | Saved web pages decoded and converted to Markdown |
| Markup languages | `.rst`, `.adoc`, `.org`, `.tex` | Read as-is (LLM-friendly) |
| Google Docs | URL | Auto-exported as .docx and parsed |
| Google Sheets | URL | Auto-exported as .xlsx and parsed |
| Google Slides | URL | Auto-exported as .pptx and parsed |

#### Ingest Methods

```
@nocion /ingest #file:raw/article.md          # From a file
@nocion /ingest #file:raw/report.pdf           # From a PDF
@nocion /ingest #file:raw/data.xlsx             # From a spreadsheet
@nocion /ingest #file:raw/deck.pptx             # From a presentation
@nocion /ingest https://example.com/article    # From a URL
@nocion /ingest https://docs.google.com/document/d/...  # Google Doc
@nocion /ingest https://docs.google.com/spreadsheets/d/...  # Google Sheet
@nocion /ingest [paste your text here]          # From pasted text
```

> **Google Workspace Note:** Google Docs, Sheets, and Slides URLs are auto-detected and exported. The document must be publicly shared ("Anyone with the link can view") for this to work.

### Query

When you ask a question, Nocion uses a two-phase approach:

1. **Page selection** — reads `wiki/index.md`, identifies 1-10 relevant pages
2. **Synthesis** — reads those pages, synthesizes an answer with `[[wikilink]]` citations

This keeps token usage proportional to answer complexity, not wiki size. Conversation history is included for follow-up questions (capped at 4000 chars to preserve context budget).

### Lint

Structural checks (no LLM needed):
- Broken `[[wikilinks]]`
- Orphan pages with no inbound links
- Pages missing from the index (exact match, not substring)
- Empty pages

Semantic checks (LLM-assisted, for wikis ≤50 pages):
- Contradictions between pages
- Missing concept pages for frequently mentioned terms
- Potentially stale claims

## Pages

Every wiki page uses YAML frontmatter + markdown with `[[wikilinks]]`:

```markdown
---
title: "Self-Attention"
type: concept
sources: [sources/attention-is-all-you-need]
updated: 2026-05-01
---

# Self-Attention

Self-attention computes a weighted sum of all positions...

## Related
- [[concepts/transformer-architecture]]
- [[sources/attention-is-all-you-need]]
```

## Development

```bash
# Install dependencies
npm install

# Watch mode (continuous compilation)
npm run watch

# Run tests
npm test

# Press F5 to launch Extension Development Host
```

### Build & Package

```bash
npm run compile
npm run package
# Creates nocion-{version}.vsix
```

### Install locally

```bash
code --install-extension nocion-0.4.0.vsix
```


## Design Decisions

- **Minimal runtime dependencies** — VS Code APIs + Language Model API + lightweight document parsers (pdf-parse, mammoth, exceljs, jszip, turndown)
- **Model-agnostic** — uses whatever model the user selects in the chat dropdown
- **Filesystem-only state** — no database, no embeddings. The wiki is just markdown files
- **JSON-structured LLM responses** — ingest and page-selection use JSON for reliable multi-file orchestration
- **Global wiki registry** — `~/.nocion` stores wiki locations so they're found from any workspace
- **Multi-wiki support** — `wiki:` arg, `/switch`, and `/all` for working with multiple wikis side-by-side
- **Safe re-ingestion** — existing pages are merged via LLM rather than overwritten

## Security

Ingested documents are untrusted content that gets passed to the LLM. Nocion implements defense-in-depth against prompt injection:

1. **Pattern detection** — scans for common injection vectors (instruction overrides, role hijacking, boundary escapes, prompt extraction attempts)
2. **Content neutralization** — injects zero-width spaces into detected malicious directives to break LLM pattern matching while preserving human readability
3. **Data boundaries** — wraps all untrusted content in clearly marked delimiters (`═══════ BEGIN/END UNTRUSTED DOCUMENT CONTENT ═══════`)
4. **Hardened system prompts** — all LLM prompts include explicit guardrail instructions to treat bounded content as data only, never as commands
5. **URL validation** — blocks fetching from localhost, private IPs, link-local addresses, and non-http(s) protocols (SSRF protection)

If injection patterns are detected, a warning is surfaced to the LLM alongside the content so it can exercise additional caution.

## Requirements

- VS Code 1.100+
- GitHub Copilot extension (provides the Language Model API)
