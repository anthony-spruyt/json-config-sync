import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import {
  deepMerge,
  stripMergeDirectives,
  createMergeContext,
  type ArrayMergeStrategy,
} from './merge.js';
import { interpolateEnvVars } from './env.js';

// =============================================================================
// Raw Config Types (as parsed from YAML)
// =============================================================================

export interface RawRepoConfig {
  git: string | string[];
  json?: Record<string, unknown>;
  override?: boolean;
}

export interface RawConfig {
  fileName: string;
  json?: Record<string, unknown>;
  mergeStrategy?: ArrayMergeStrategy;
  repos: RawRepoConfig[];
}

// =============================================================================
// Normalized Config Types (output)
// =============================================================================

export interface RepoConfig {
  git: string;
  json: Record<string, unknown>;
}

export interface Config {
  fileName: string;
  repos: RepoConfig[];
}

// =============================================================================
// Validation
// =============================================================================

function validateRawConfig(config: RawConfig): void {
  if (!config.fileName) {
    throw new Error('Config missing required field: fileName');
  }

  if (!config.repos || !Array.isArray(config.repos)) {
    throw new Error('Config missing required field: repos (must be an array)');
  }

  const hasRootJson = config.json !== undefined;

  for (let i = 0; i < config.repos.length; i++) {
    const repo = config.repos[i];
    if (!repo.git) {
      throw new Error(`Repo at index ${i} missing required field: git`);
    }
    if (!hasRootJson && !repo.json) {
      throw new Error(`Repo at index ${i} missing required field: json (no root-level json defined)`);
    }
    if (repo.override && !repo.json) {
      throw new Error(`Repo ${getGitDisplayName(repo.git)} has override: true but no json defined`);
    }
  }
}

function getGitDisplayName(git: string | string[]): string {
  if (Array.isArray(git)) {
    return git[0] || 'unknown';
  }
  return git;
}

// =============================================================================
// Normalization Pipeline
// =============================================================================

function normalizeConfig(raw: RawConfig): Config {
  const baseJson = raw.json ?? {};
  const defaultStrategy = raw.mergeStrategy ?? 'replace';
  const expandedRepos: RepoConfig[] = [];

  for (const rawRepo of raw.repos) {
    // Step 1: Expand git arrays
    const gitUrls = Array.isArray(rawRepo.git) ? rawRepo.git : [rawRepo.git];

    for (const gitUrl of gitUrls) {
      // Step 2: Compute merged JSON
      let mergedJson: Record<string, unknown>;

      if (rawRepo.override) {
        // Override mode: use only repo json
        mergedJson = stripMergeDirectives(
          structuredClone(rawRepo.json as Record<string, unknown>)
        );
      } else if (!rawRepo.json) {
        // No repo json: use root json as-is
        mergedJson = structuredClone(baseJson);
      } else {
        // Merge mode: deep merge base + overlay
        const ctx = createMergeContext(defaultStrategy);
        mergedJson = deepMerge(
          structuredClone(baseJson),
          rawRepo.json,
          ctx
        );
        mergedJson = stripMergeDirectives(mergedJson);
      }

      // Step 3: Interpolate env vars
      mergedJson = interpolateEnvVars(mergedJson, { strict: true });

      expandedRepos.push({
        git: gitUrl,
        json: mergedJson,
      });
    }
  }

  return {
    fileName: raw.fileName,
    repos: expandedRepos,
  };
}

// =============================================================================
// Public API
// =============================================================================

export function loadConfig(filePath: string): Config {
  const content = readFileSync(filePath, 'utf-8');
  const rawConfig = parse(content) as RawConfig;

  validateRawConfig(rawConfig);

  return normalizeConfig(rawConfig);
}

export function convertJsonToString(json: Record<string, unknown>): string {
  return JSON.stringify(json, null, 2);
}
