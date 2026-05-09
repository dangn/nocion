# Nocion VS Code Extension Implementation Plan

## Context Reviewed

- `PRD.md`: defines Nocion as an LLM-powered personal wiki inside VS Code Chat, with commands for `/init`, `/ingest`, `/query`, `/lint`, `/status`, `/switch`, and `/all`.
- Andrej Karpathy's LLM Wiki write-up: frames the core product pattern as a persistent, LLM-maintained markdown wiki between raw sources and user questions, where knowledge compounds instead of being re-derived on each query.
- VS Code Chat Participant API: a chat participant is a domain-specific assistant invoked with `@name`; the extension contributes the participant in `package.json`, registers it with `vscode.chat.createChatParticipant`, and owns request orchestration.
- VS Code Language Model API: in a chat participant, use `request.model` so Nocion respects the model the user selected in the chat dropdown.
- Atlassian Cloud REST and MCP auth docs: Jira and Confluence personal API-token flows use the user's Atlassian email address plus API token; passwords are deprecated, and OAuth should remain the preferred future path for broadly distributed Atlassian integrations.

## Product Shape

Build Nocion as a VS Code extension, not a separate service. The user talks to `@nocion` in Copilot Chat. Nocion routes the request, reads or writes local wiki files, calls the selected VS Code language model when needed, and streams progress plus final markdown back into the chat response.

The implementation should preserve the PRD's major design constraints:

- Filesystem-only state: markdown files plus `.nocion.json`, with global discovery through `~/.nocion`.
- No embeddings or database in the first version.
- Model-agnostic LLM access through the VS Code Language Model API.
- Persistent generated wiki pages with YAML frontmatter and `[[wikilinks]]`.
- Safe ingest pipeline for untrusted documents and URLs.
- Optional Jira and Confluence source adapters that request missing site, email, and token credentials interactively and store tokens only in VS Code SecretStorage.
- Deterministic structural linting, with optional LLM-assisted semantic checks.

## Architecture

### Extension Entry Layer

Files:

- `package.json`
- `src/extension.ts`
- `src/chat/participant.ts`
- `src/chat/router.ts`
- `src/chat/commands.ts`

Responsibilities:

- Contribute one chat participant:
  - `id`: `nocion.chat`
  - `name`: `nocion`
  - `fullName`: `Nocion`
  - `description`: `Ask and maintain your personal wiki`
  - `isSticky`: `true`
- Contribute slash commands for `/init`, `/ingest`, `/query`, `/lint`, `/status`, `/switch`, and `/all`.
- Activate on `onChatParticipant:nocion.chat`.
- Register the participant with `vscode.chat.createChatParticipant('nocion.chat', handler)`.
- In the handler, route by `request.command` first, then infer intent from `request.prompt` for natural language.
- Use `request.model` for all model calls in chat, passing the request `CancellationToken`.
- Stream progress with `stream.progress(...)`, final answers with `stream.markdown(...)`, and wiki file references with `stream.reference(...)` or `stream.anchor(...)`.

### Command Routing Layer

Files:

- `src/chat/requestParser.ts`
- `src/chat/wikiTarget.ts`
- `src/chat/sessionState.ts`

Responsibilities:

- Parse command, natural language prompt, `wiki:` target, quoted wiki names, `path:`, `domain:`, URLs, and `#file:` references.
- Maintain session-level active wiki for `/switch`.
- Normalize wiki names case-insensitively and dash-insensitively.
- Route requests:
  - Explicit slash command wins.
  - Natural language defaults to `/query`.
  - High-confidence ingest intent routes to `/ingest`.
  - Missing wiki state produces actionable setup guidance instead of an LLM call.

### Wiki Storage Layer

Files:

- `src/wiki/discovery.ts`
- `src/wiki/registry.ts`
- `src/wiki/config.ts`
- `src/wiki/store.ts`
- `src/wiki/markdown.ts`
- `src/wiki/links.ts`
- `src/wiki/slugs.ts`
- `src/wiki/frontmatter.ts`

Responsibilities:

- Implement `findWikiRoot()` in the PRD order:
  1. Explicit `wiki:` lookup by name.
  2. Session active wiki.
  3. Workspace folder roots containing `.nocion.json`.
  4. Immediate subdirectories of the first workspace folder.
  5. Global registry at `~/.nocion`.
- Implement `findAllWikiRoots()` for `/switch` and `/all`, deduplicating by resolved filesystem path.
- Create wiki scaffolds:
  - `raw/`
  - `wiki/index.md`
  - `wiki/log.md`
  - `wiki/overview.md`
  - `wiki/entities/`
  - `wiki/concepts/`
  - `wiki/sources/`
  - `wiki/synthesis/`
  - `.nocion.json`
- Provide safe read/write helpers using `vscode.workspace.fs` where possible and Node `fs` only where the VS Code API is insufficient.
- Write through temporary files, then rename, to reduce partial-write risk.
- Preserve user-authored raw files and never mutate `raw/` except for URL/Google export provenance saves.

### Source Loading And Parsing Layer

Files:

- `src/ingest/sourceLoader.ts`
- `src/ingest/sourceIdentity.ts`
- `src/ingest/parsers/text.ts`
- `src/ingest/parsers/html.ts`
- `src/ingest/parsers/pdf.ts`
- `src/ingest/parsers/docx.ts`
- `src/ingest/parsers/spreadsheet.ts`
- `src/ingest/parsers/presentation.ts`
- `src/ingest/parsers/archiveXml.ts`
- `src/ingest/parsers/notebook.ts`

Responsibilities:

- Resolve `#file:` references from chat variables or prompt text.
- Read pasted text directly from `request.prompt`.
- Fetch URLs only after URL validation.
- Convert fetched HTML to markdown and save it under `raw/` for provenance.
- Auto-export public Google Docs, Sheets, and Slides URLs to `.docx`, `.xlsx`, and `.pptx`, then pass them through the normal parser pipeline.
- Normalize parsed output to:
  - source title
  - source URI or path
  - detected format
  - content markdown
  - provenance metadata
  - parser warnings
- Keep heavy parser dependencies modular and lazy-loaded.

### Atlassian Integration Layer

Files:

- `src/integrations/atlassian/auth.ts`
- `src/integrations/atlassian/credentials.ts`
- `src/integrations/atlassian/jira.ts`
- `src/integrations/atlassian/confluence.ts`
- `src/integrations/atlassian/http.ts`
- `src/integrations/atlassian/types.ts`
- `src/integrations/atlassian/mappers.ts`

Responsibilities:

- Support Jira and Confluence as remote source providers for `/ingest`.
- Accept Atlassian source forms:
  - Jira issue URL.
  - Jira issue key plus configured site, such as `PROJ-123`.
  - Jira JQL query or saved filter.
  - Confluence page URL.
  - Confluence space/page selector when a site is configured.
- Require these credentials per Atlassian site:
  - site base URL, such as `https://example.atlassian.net`
  - Atlassian account email address
  - Jira API token for Jira operations
  - Confluence API token for Confluence operations
- Prompt for missing credentials at the point of use:
  - ask for site URL with `vscode.window.showInputBox`
  - ask for email address with validation
  - ask for API tokens with `password: true`
  - explain which product needs the token and link to Atlassian token creation docs
  - stop the operation without filesystem writes if the user cancels
- Store API tokens in `context.secrets`; never store tokens in `.nocion.json`, `~/.nocion`, wiki markdown, logs, test snapshots, or chat output.
- Store non-secret Atlassian profile metadata, such as site URL, email, product enabled flags, and last validation time, in VS Code `globalState`.
- Build Basic auth headers from `email:api_token` at request time only, then discard the encoded value.
- Validate credentials with a low-impact authenticated request before fetching issue or page content.
- Redact API tokens, Authorization headers, and token-like strings from errors and output-channel logs.
- Fetch Jira and Confluence content with pagination, retry/backoff for rate limits, cancellation support, and product-specific 401/403 guidance.
- Normalize Jira issues and Confluence pages into the same source model used by file and URL ingest.
- Save remote provenance under `raw/atlassian/` with sanitized filenames and metadata that identifies source URL, fetch time, product, and content version.
- Keep OAuth 2.0 as the planned marketplace-grade upgrade path; token-based auth is acceptable for local/private use and testable MVP flows.

### Security Layer

Files:

- `src/security/urlGuard.ts`
- `src/security/promptInjection.ts`
- `src/security/pathGuard.ts`
- `src/security/untrustedContent.ts`

Responsibilities:

- Block non-HTTP(S) URLs, localhost, private IPs, link-local addresses, and DNS results that resolve to private ranges.
- Restrict file references to the selected wiki, workspace, or explicitly allowed absolute paths.
- Restrict Atlassian API calls to user-confirmed Atlassian site origins and block redirects to untrusted hosts.
- Detect prompt-injection patterns in ingested content.
- Neutralize detected directives while preserving human readability.
- Wrap all source content in explicit untrusted-content boundaries before passing it to the LLM.
- Surface warnings in chat when risky content was detected.

### LLM Orchestration Layer

Files:

- `src/llm/client.ts`
- `src/llm/json.ts`
- `src/llm/prompts/intent.ts`
- `src/llm/prompts/ingest.ts`
- `src/llm/prompts/querySelect.ts`
- `src/llm/prompts/querySynthesize.ts`
- `src/llm/prompts/mergePage.ts`
- `src/llm/prompts/lintSemantic.ts`

Responsibilities:

- Wrap `request.model.sendRequest(...)` behind a small `LlmClient` interface for testability.
- Because the Language Model API prompt model is user/assistant messages, encode "system" behavior as the first user instruction message.
- Support three response modes:
  - streaming markdown to chat
  - strict JSON extraction for orchestration
  - bounded page merge output
- Validate JSON responses with schemas before writing files.
- Retry once with a compact repair prompt when JSON is malformed.
- Respect `request.model.maxInputTokens` with deterministic truncation and prompt budget accounting.
- Cap conversation history to the PRD's 4000-character target.

### Operation Services

Files:

- `src/commands/init.ts`
- `src/commands/ingest.ts`
- `src/commands/query.ts`
- `src/commands/lint.ts`
- `src/commands/status.ts`
- `src/commands/switch.ts`
- `src/commands/all.ts`

Responsibilities:

- `/init`:
  - Resolve name, path, and domain.
  - Create scaffold.
  - Write `.nocion.json`.
  - Register wiki in `~/.nocion`.
  - Stream a file tree preview and next-step guidance.
- `/ingest`:
  - Load source.
  - Sanitize and bound content.
  - For Jira or Confluence sources, resolve credentials, prompt for any missing site/email/token values, validate access, and normalize remote content.
  - Ask LLM for extracted entities, concepts, claims, and proposed page updates as JSON.
  - Merge source, entity, concept, overview, index, and log pages.
  - Stream progress at each major step.
- `/query`:
  - Read `wiki/index.md`.
  - Ask LLM to select 1-10 relevant pages as JSON.
  - Read selected pages.
  - Ask LLM to synthesize a cited answer using `[[wikilink]]` citations.
  - Stream references to the selected files.
- `/lint`:
  - Run structural checks deterministically.
  - Run semantic checks only when the wiki has 50 or fewer pages, unless the user explicitly overrides.
  - Return grouped findings and suggested fixes.
- `/status`:
  - Count pages, backlinks, orphan pages, recent log entries, and last update time.
- `/switch`:
  - Without args, list discovered wikis and active wiki.
  - With args, update session active wiki.
- `/all`:
  - Read indexes from all discovered wikis.
  - Select relevant pages per wiki.
  - Synthesize one unified answer with wiki-qualified citations.

## Data Flow

### Chat Request

1. User sends `@nocion ...` in VS Code Chat.
2. VS Code invokes the Nocion `ChatRequestHandler`.
3. Handler parses command, prompt, variables, and wiki target.
4. Router resolves operation service.
5. Service reads local wiki state and source content.
6. Service calls `request.model` only when LLM reasoning or writing is required.
7. Service writes wiki changes if the operation mutates state.
8. Handler streams progress, markdown, buttons, and references back to Chat.

### Jira Or Confluence Credential Flow

1. User runs `/ingest` with a Jira or Confluence URL, issue key, JQL query, saved filter, page URL, or page selector.
2. Integration layer resolves the Atlassian site and product.
3. Credential service checks `globalState` for site/email metadata and `context.secrets` for the needed product token.
4. If any required value is missing, the extension prompts for site URL, email address, and the missing token with a password input.
5. User cancellation ends the operation before LLM calls or wiki writes.
6. Credentials are validated with a low-impact API call.
7. Valid remote content is fetched, normalized, saved under `raw/atlassian/`, then passed into the normal ingest flow.

### Ingest

1. Resolve wiki root.
2. Load source from file, URL, Google export, pasted text, Jira, or Confluence.
3. Persist fetched remote source into `raw/`.
4. Scan and neutralize prompt-injection patterns.
5. Build an ingest prompt with existing index, overview excerpts, source metadata, and bounded untrusted content.
6. Receive validated JSON plan of page changes.
7. For each existing page, ask the LLM to merge rather than overwrite.
8. Write new or changed pages.
9. Update `index.md`.
10. Append to `log.md`.
11. Stream summary and file references.

### Query

1. Resolve wiki root.
2. Read `index.md`.
3. Add bounded relevant chat history.
4. Ask LLM to select relevant pages.
5. Read selected pages.
6. Ask LLM to answer with `[[wikilink]]` citations.
7. Stream answer and references.

## Implementation Phases

### Phase 1: Extension Skeleton And Chat Participant

Deliverables:

- TypeScript VS Code extension scaffold.
- `package.json` chat participant contribution and activation event.
- `src/extension.ts` registration.
- Router with command stubs.
- Basic `/status` error path when no wiki exists.

Exit criteria:

- Extension launches in Extension Development Host.
- `@nocion /status` reaches the handler.
- Missing setup produces a clear non-LLM response.

### Phase 2: Wiki Scaffolding And Discovery

Deliverables:

- `/init`, `/switch`, `/status`.
- `.nocion.json` schema.
- `~/.nocion` registry read/write.
- Discovery functions and path normalization.

Exit criteria:

- Wiki can be initialized at workspace root, subdirectory, home-relative path, and absolute path.
- `/switch` lists and selects wikis.
- `/status` reports page counts and recent activity.

### Phase 3: Query MVP

Deliverables:

- `LlmClient` wrapper using `request.model`.
- Query page-selection prompt returning validated JSON.
- Synthesis prompt returning cited markdown.
- File references in chat output.

Exit criteria:

- Natural language routes to `/query`.
- Query reads `index.md`, selects pages, and answers from wiki content.
- Unit tests cover routing, page selection JSON parsing, and missing-page handling.

### Phase 4: Markdown/Text/URL Ingest

Deliverables:

- Source loader for `.md`, `.txt`, `.json`, pasted text, HTML, and URL.
- URL guard and untrusted content wrapper.
- Ingest extraction prompt with JSON response.
- Merge flow for source, entity, concept, overview, index, and log pages.

Exit criteria:

- Re-ingesting the same source merges instead of overwriting.
- URL ingest saves provenance under `raw/`.
- Prompt-injection warning appears when patterns are detected.

### Phase 5: Structural Lint And Link Integrity

Deliverables:

- Wikilink parser.
- Broken-link detection.
- Orphan detection.
- Missing-index detection.
- Empty-page detection.
- `/lint` output with file references.

Exit criteria:

- Lint runs without LLM access.
- Structural lint has deterministic unit tests using fixture wikis.

### Phase 6: Additional File Formats

Deliverables:

- Parsers for PDF, DOCX, RTF, XLSX, CSV, PPTX, EPUB, ODT, ODP, IPYNB, TSV, XML/RSS, MHTML, RST, ADOC, ORG, and TEX.
- Public Google Docs, Sheets, and Slides export support.
- Parser warning reporting.

Exit criteria:

- Each parser has fixture-based unit tests.
- Unsupported or malformed files fail with a useful chat message.

### Phase 7: Jira And Confluence Integrations

Deliverables:

- Atlassian credential service using `context.secrets` for tokens and `globalState` for non-secret site/email metadata.
- Missing-credential prompt flow for site URL, email address, Jira token, and Confluence token.
- Jira issue, JQL, and saved-filter fetchers.
- Confluence page and page-selector fetchers.
- Remote source normalization and provenance saves under `raw/atlassian/`.
- Mock Atlassian transport for automated tests.

Exit criteria:

- Missing credentials trigger prompts and cancellation leaves the wiki unchanged.
- Tokens are never written to wiki files, `.nocion.json`, `~/.nocion`, logs, snapshots, or chat output.
- Valid Jira and Confluence sources ingest through the same merge pipeline as file/URL sources.
- 401, 403, 404, rate-limit, pagination, and network failures return actionable messages.
- Unit, integration, and mocked end-to-end tests cover both products before release.

### Phase 8: Multi-Wiki Query And Semantic Lint

Deliverables:

- `/all` cross-wiki index search and synthesis.
- LLM-assisted semantic lint for wikis with 50 or fewer pages.
- Stale-claim and contradiction prompts.

Exit criteria:

- `/all` returns wiki-qualified citations.
- Semantic lint can be skipped, cancelled, or run explicitly.

### Phase 9: Hardening, Packaging, And Marketplace Readiness

Deliverables:

- Error taxonomy and user-facing messages.
- Cancellation support throughout long operations.
- Output channel logging with sensitive content redaction.
- Telemetry opt-in or no telemetry.
- Security review for local files, remote fetches, Atlassian credentials, and LLM prompt boundaries.
- `npm run compile`, `npm test`, and `npm run package`.
- `.vsix` local install path.

Exit criteria:

- Extension packages cleanly.
- Full automated test suite and manual smoke suite pass.
- README quick start matches the PRD.

## Testing Strategy

Testing principle: every user-visible command, source adapter, mutation path, security guard, and integration branch must have automated happy-path and failure-path coverage before its phase is considered complete. Automated tests must not call real LLMs or real Atlassian services.

Test stack:

- Use fast Node unit tests for pure modules: parser, routing, wiki services, security, source normalization, and LLM JSON handling.
- Use VS Code extension-host tests through `@vscode/test-electron` for chat participant registration and command integration.
- Use a fake `LlmClient` for all automated LLM tests, including streaming chunks, malformed JSON, cancellation, quota-like failures, and model errors.
- Use mocked HTTP transports for URL, Jira, Confluence, and Google export tests.
- Use temporary fixture workspaces and fixture wiki directories; never touch the user's real `~/.nocion` in tests.
- Keep parser fixture files small but representative, with one valid fixture and one malformed fixture for each supported format.
- Run secret-leak assertions over generated wiki files, logs, snapshots, and chat transcripts.

Feature coverage matrix:

```
+----------------------+------------------------------------------+------------------------------------------+
| Feature area         | Automated coverage                       | Manual release check                     |
+----------------------+------------------------------------------+------------------------------------------+
| Chat participant     | Registration, slash commands, routing,   | Invoke @nocion commands in Extension     |
|                      | cancellation, selected-model plumbing    | Development Host                         |
+----------------------+------------------------------------------+------------------------------------------+
| Wiki lifecycle       | Init, discovery, registry, switch,       | Create wikis in workspace, subdirectory, |
|                      | status, path normalization, collisions   | home path, and absolute path             |
+----------------------+------------------------------------------+------------------------------------------+
| Ingest               | File, URL, pasted text, all parsers,     | Ingest representative local and remote   |
|                      | merge writes, re-ingest, provenance      | sources                                  |
+----------------------+------------------------------------------+------------------------------------------+
| Query                | Page selection, cited synthesis,         | Ask initial and follow-up questions      |
|                      | history cap, missing pages, /all         | across one and multiple wikis            |
+----------------------+------------------------------------------+------------------------------------------+
| Lint                 | Broken links, orphans, index misses,     | Run /lint before and after deliberate    |
|                      | empty pages, semantic lint gating        | wiki damage                              |
+----------------------+------------------------------------------+------------------------------------------+
| Security             | SSRF, path traversal, prompt injection,  | Verify risky input produces warnings     |
|                      | untrusted boundaries, redaction          | without corrupting wiki state            |
+----------------------+------------------------------------------+------------------------------------------+
| Jira                 | Missing credentials, token storage,      | Ingest one issue, one JQL result, and    |
|                      | auth errors, pagination, rate limits     | one saved-filter result with test site   |
+----------------------+------------------------------------------+------------------------------------------+
| Confluence           | Missing credentials, token storage,      | Ingest one page and one page selector    |
|                      | auth errors, pagination, attachments     | result with test site                    |
+----------------------+------------------------------------------+------------------------------------------+
| Packaging            | Compile, lint, unit tests, extension     | Install packaged VSIX in clean profile   |
|                      | host tests, package command              | and run smoke suite                      |
+----------------------+------------------------------------------+------------------------------------------+
```

Unit tests:

- Request parsing for slash commands, natural-language default query routing, ingest intent routing, `wiki:`, quoted wiki names, `path:`, `domain:`, URLs, Jira issue keys, Confluence page selectors, and `#file:`.
- Wiki discovery and registry behavior, including duplicate paths, invalid registry entries, missing workspace folders, and name collisions.
- Slug generation, wikilink parsing, backlinks, frontmatter read/write, and markdown merge helpers.
- Atomic writes, temp-file cleanup, cancellation before writes, cancellation during multi-page writes, and recovery from partial previous temp files.
- URL blocking for private IP ranges, localhost, redirects, malformed URLs, non-HTTP(S) schemes, DNS failures, and oversized responses.
- Path guard behavior for relative paths, home paths, absolute paths, workspace files, symlinks, and traversal attempts.
- Prompt-injection detection, neutralization, untrusted-content wrapping, and warning propagation.
- JSON extraction, schema validation, malformed JSON repair, and no-write failure on invalid orchestration output.
- Structural lint checks against fixture wikis.
- Parser fixtures for every supported format listed in the PRD.
- Atlassian credential lookup, missing-field detection, prompt sequencing, validation success/failure, token redaction, and SecretStorage keys.

Integration tests:

- VS Code extension-host test for participant registration, activation event, command metadata, and handler execution.
- `/init` creates the expected directory tree and registry entry.
- `/switch` lists discovered wikis and sets active wiki without leaking across sessions incorrectly.
- `/status` reads initialized wiki state and reports counts accurately.
- `/query` with a fake `LlmClient` selects fixture pages and returns cited markdown.
- Natural-language query routes to `/query`; natural-language ingest intent routes to `/ingest`.
- `/ingest` with a fake `LlmClient` writes expected source, entity, concept, overview, index, and log changes.
- Re-ingest merges changes and preserves existing sourced claims.
- `/lint` returns deterministic structural findings and optionally invokes semantic lint only within the configured page limit.
- `/all` discovers multiple fixture wikis and returns wiki-qualified citations.
- Jira ingest through mocked API responses writes normalized raw provenance and wiki updates.
- Confluence ingest through mocked API responses writes normalized raw provenance and wiki updates.

End-to-end test scenarios:

- Start with an empty workspace, run `/init`, ingest a markdown source, query it, lint it, and inspect status.
- Initialize two wikis, switch between them, query each, and run `/all`.
- Ingest a URL that redirects safely and a URL that redirects to a blocked private address.
- Ingest every supported file fixture and verify parser warnings, raw provenance, source page creation, and index updates.
- Simulate selected model errors, malformed JSON, cancellation, and token-budget truncation.
- Simulate Jira missing credentials, successful credential prompt, issue ingest, 401, 403, 404, rate limit, and paginated results.
- Simulate Confluence missing credentials, successful credential prompt, page ingest, permission failure, missing page, and paginated children or attachments.

LLM boundary tests:

- Do not call real language models in automated tests.
- Mock `request.model.sendRequest(...)` with streaming fixtures.
- Assert every model call uses the `request.model` supplied by VS Code Chat.
- Assert deterministic operations such as `/status` and structural `/lint` do not call the LLM.
- Test malformed JSON repair without network or quota dependency.
- Test model cancellation propagates and prevents further writes.

Credential and secret tests:

- Missing Jira token prompts for Jira token; missing Confluence token prompts for Confluence token.
- Missing email prompts once and reuses stored metadata after validation.
- Tokens entered through password inputs are stored only in `context.secrets`.
- Token updates replace the prior secret and invalidate stale validation metadata.
- Auth failures can trigger a re-prompt without exposing the old token.
- Test artifacts and output logs are scanned for token and Authorization-header leaks.

Manual release smoke suite:

- Launch Extension Development Host with F5.
- Run `@nocion /init "My Research" domain:ml`.
- Ingest a markdown file from `raw/`.
- Ingest one URL and confirm raw provenance is saved.
- Ingest representative PDF, DOCX, XLSX, PPTX, IPYNB, and EPUB fixtures.
- Ask a natural-language query without `/query`.
- Ask a follow-up question and confirm bounded conversation history is used.
- Run `/lint`, `/status`, `/switch`, and `/all`.
- Ingest one Jira issue and one Jira JQL result from a test Atlassian site.
- Ingest one Confluence page from a test Atlassian site.
- Remove stored Jira or Confluence token and confirm the app prompts again.
- Cancel a long ingest and verify no partial corrupt page remains.
- Package the extension, install the VSIX in a clean VS Code profile, and rerun the quick-start flow.

Release gates:

- `npm run compile` passes.
- `npm test` passes all unit, integration, and mocked end-to-end tests.
- `npm run package` produces a VSIX.
- Coverage is high enough to protect core logic: at least 90% statement coverage for pure TypeScript modules, and explicit branch tests for security, credential, and write-path code.
- No snapshot, log, fixture output, or generated wiki file contains an API token or Authorization header.
- All phase exit criteria are backed by tests or documented manual checks.

## Risks And Mitigations

- Prompt injection from ingested content: keep untrusted source content delimited, scan for common attack patterns, neutralize directives, and reinforce data-only instructions in every prompt that includes source text.
- LLM writes malformed JSON: schema-validate all orchestration responses, retry once with a repair prompt, then fail without writing files.
- Partial writes corrupt the wiki: write temporary files, validate generated markdown/frontmatter, then rename.
- Large documents exceed context: use `request.model.maxInputTokens`, deterministic truncation, and phased ingest where needed.
- Semantic merge may erase useful details: always include existing page content in merge prompts and require the model to preserve sourced claims unless explicitly superseded.
- File parser dependency bloat: lazy-load optional parsers and keep markdown/text/URL ingest as the MVP.
- User-selected model may be unavailable or quota-limited: catch `LanguageModelError`, explain the failure, and avoid losing local operation state.
- Multi-wiki ambiguity: require explicit selection when names collide after normalization.
- Remote URL SSRF: validate scheme, host, DNS result, redirects, and final IP range before fetch.
- Atlassian credential exposure: store tokens only in VS Code SecretStorage, redact all auth material from logs and chat, and scan test artifacts for leaks.
- Atlassian auth policy drift: keep token-based auth isolated behind an auth adapter so OAuth 2.0 can replace or supplement it without rewriting ingest logic.
- Atlassian permission and rate-limit failures: validate credentials before ingest, show product-specific remediation, and implement retry/backoff with cancellation.
- Non-deterministic LLM behavior: keep all routing, discovery, parsing, linting, and JSON validation deterministic and unit-tested.

## Recommended First PR

The first implementation slice should be intentionally small:

1. Scaffold the TypeScript VS Code extension.
2. Register `@nocion` and all slash commands in `package.json`.
3. Implement the chat handler, command router, and parser.
4. Implement `/init`, `/status`, `/switch`, wiki discovery, and registry.
5. Add the test harness, fake `LlmClient`, temporary wiki fixtures, and unit tests for parser, discovery, registry, and status output.

This first PR proves the VS Code Chat Participant integration and the local wiki state model before introducing LLM calls or document parsing.

## References

- Local PRD: `PRD.md`
- Karpathy LLM Wiki: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- VS Code Chat Participant API: https://code.visualstudio.com/api/extension-guides/ai/chat
- VS Code Language Model API: https://code.visualstudio.com/api/extension-guides/ai/language-model
- VS Code Activation Events: https://code.visualstudio.com/api/references/activation-events
- Atlassian Jira Cloud Basic auth for REST APIs: https://developer.atlassian.com/cloud/jira/service-desk/basic-auth-for-rest-apis/
- Atlassian Confluence Cloud Basic auth for REST APIs: https://developer.atlassian.com/cloud/confluence/basic-auth-for-rest-apis/
- Atlassian Rovo MCP API-token auth: https://support.atlassian.com/atlassian-rovo-mcp-server/docs/configuring-authentication-via-api-token/
