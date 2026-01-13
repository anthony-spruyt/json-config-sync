# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

TypeScript CLI tool that syncs JSON configuration files across multiple Git repositories by automatically creating pull requests. Supports both GitHub and Azure DevOps platforms.

## Architecture

### Orchestration Flow (index.ts)
The tool processes repositories sequentially with a 9-step workflow per repo:
1. Clean workspace (remove old clones)
2. Clone repository
3. Detect default branch (main/master)
4. Create/checkout sync branch (`chore/sync-{sanitized-filename}`)
5. Write JSON file from config
6. Check for changes (skip if none)
7. Commit changes
8. Push to remote
9. Create PR (platform-specific)

**Error Resilience**: If any repo fails, the tool continues processing remaining repos. Errors are logged and summarized at the end. Exit code 1 only if failures occurred.

### Platform Detection (repo-detector.ts)
Auto-detects GitHub vs Azure DevOps from git URL patterns:
- GitHub SSH: `git@github.com:owner/repo.git`
- GitHub HTTPS: `https://github.com/owner/repo.git`
- Azure SSH: `git@ssh.dev.azure.com:v3/org/project/repo`
- Azure HTTPS: `https://dev.azure.com/org/project/_git/repo`

Returns `RepoInfo` with normalized fields (owner, repo, organization, project) used by PR creator.

### PR Creation Strategy (pr-creator.ts)
**Idempotency**: Checks for existing PR on branch before creating new one. Returns URL of existing PR if found.

**Shell Safety**: Uses `escapeShellArg()` to wrap all user-provided strings passed to `gh`/`az` CLI. Special handling: wraps in single quotes and escapes embedded single quotes as `'\''`.

**Template System**: Loads PR body from `PR.md` file (included in npm package). Uses `{{FILE_NAME}}` and `{{ACTION}}` placeholders. Writes body to temp file to avoid shell escaping issues with multiline strings.

### Git Operations (git-ops.ts)
**Branch Strategy**:
- Sanitizes filename for branch name (removes extension, lowercase, alphanumeric+dashes only)
- Checks if branch exists on remote first (`git fetch origin <branch>`)
- Reuses existing branch if found, otherwise creates new one
- This allows updates to existing PRs instead of creating duplicates

**Default Branch Detection**: Tries multiple methods in order:
1. `git remote show origin` (parse HEAD branch)
2. Check if `origin/main` exists
3. Check if `origin/master` exists
4. Default to `main`

**Dry Run**: When `--dry-run` flag is used, commits and pushes are skipped, but file writes and branch creation still occur locally for validation.

## Configuration Format

YAML structure:
```yaml
fileName: my.config.json  # Target file to create in each repo
repos:
  - git: git@github.com:org/repo.git
    json: { "key": "value" }  # Will be formatted with 2-space indent
  - git: git@ssh.dev.azure.com:v3/org/project/repo
    json: { "key": "differentValue" }
```

JSON formatting: Always uses 2-space indentation via `JSON.stringify(json, null, 2)` plus trailing newline.

## Development Commands

```bash
npm run build              # Compile TypeScript to dist/
npm test                   # Unit tests (config.test.ts only)
npm run test:integration   # Build + integration test (requires gh auth)
npm run dev                # Run with fixtures/test-repos-input.yaml
npm run release:patch      # Bump patch version, create tag, push
```

**Integration Tests**: Requires `gh` CLI authentication. Uses real GitHub repo `anthony-spruyt/json-config-sync-test`. Cleans up state before running (closes PRs, deletes branch, removes file).

## External Dependencies

**Required**:
- Node.js >= 18
- `git` CLI (for cloning/pushing)
- `gh` CLI (for GitHub repos) - must be authenticated via `gh auth login`
- `az` CLI (for Azure DevOps repos) - must be authenticated and configured

**Package Structure**:
- Published as ESM (`"type": "module"`)
- Uses `.js` extensions in imports (TypeScript requirement for NodeNext)
- Binary entry point: `dist/index.js` (has shebang)

## Testing Approach

**Unit Tests**: Focus on config parsing and JSON conversion. Use fixtures in `fixtures/` directory.

**Integration Tests**: End-to-end test that:
1. Sets up clean state in test repo
2. Runs CLI with `fixtures/integration-test-config.yaml`
3. Verifies PR creation via `gh` CLI
4. Checks file content in PR branch

**No Mocking**: Git operations and CLI tools are not mocked. Integration test uses real GitHub API.
