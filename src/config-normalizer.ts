import {
  deepMerge,
  stripMergeDirectives,
  createMergeContext,
} from "./merge.js";
import { interpolateEnvVars } from "./env.js";
import type { RawConfig, Config, RepoConfig, FileContent } from "./config.js";

/**
 * Normalizes raw config into expanded, merged config.
 * Pipeline: expand git arrays -> merge content -> interpolate env vars
 */
export function normalizeConfig(raw: RawConfig): Config {
  const expandedRepos: RepoConfig[] = [];
  const fileNames = Object.keys(raw.files);

  for (const rawRepo of raw.repos) {
    // Step 1: Expand git arrays
    const gitUrls = Array.isArray(rawRepo.git) ? rawRepo.git : [rawRepo.git];

    for (const gitUrl of gitUrls) {
      const files: FileContent[] = [];

      // Step 2: Process each file definition
      for (const fileName of fileNames) {
        const repoOverride = rawRepo.files?.[fileName];

        // Skip excluded files (set to false)
        if (repoOverride === false) {
          continue;
        }

        const fileConfig = raw.files[fileName];
        const baseContent = fileConfig.content ?? {};
        const fileStrategy = fileConfig.mergeStrategy ?? "replace";

        // Step 3: Compute merged content for this file
        let mergedContent: Record<string, unknown>;

        if (repoOverride?.override) {
          // Override mode: use only repo file content
          mergedContent = stripMergeDirectives(
            structuredClone(repoOverride.content as Record<string, unknown>),
          );
        } else if (!repoOverride?.content) {
          // No repo override: use file base content as-is
          mergedContent = structuredClone(baseContent);
        } else {
          // Merge mode: deep merge file base + repo overlay
          const ctx = createMergeContext(fileStrategy);
          mergedContent = deepMerge(
            structuredClone(baseContent),
            repoOverride.content,
            ctx,
          );
          mergedContent = stripMergeDirectives(mergedContent);
        }

        // Step 4: Interpolate env vars
        mergedContent = interpolateEnvVars(mergedContent, { strict: true });

        // Resolve createOnly: per-repo overrides root level
        const createOnly = repoOverride?.createOnly ?? fileConfig.createOnly;

        files.push({
          fileName,
          content: mergedContent,
          createOnly,
        });
      }

      expandedRepos.push({
        git: gitUrl,
        files,
      });
    }
  }

  return {
    repos: expandedRepos,
  };
}
