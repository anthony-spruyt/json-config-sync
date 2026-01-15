import { describe, test } from "node:test";
import assert from "node:assert";
import { getPRStrategy } from "./index.js";
import { GitHubPRStrategy } from "./github-pr-strategy.js";
import { AzurePRStrategy } from "./azure-pr-strategy.js";
import { GitHubRepoInfo, AzureDevOpsRepoInfo } from "../repo-detector.js";

describe("getPRStrategy", () => {
  test("returns GitHubPRStrategy for GitHub repos", () => {
    const repoInfo: GitHubRepoInfo = {
      type: "github",
      gitUrl: "git@github.com:owner/repo.git",
      owner: "owner",
      repo: "repo",
    };

    const strategy = getPRStrategy(repoInfo);
    assert.ok(strategy instanceof GitHubPRStrategy);
  });

  test("returns AzurePRStrategy for Azure DevOps repos", () => {
    const repoInfo: AzureDevOpsRepoInfo = {
      type: "azure-devops",
      gitUrl: "git@ssh.dev.azure.com:v3/org/project/repo",
      owner: "org",
      repo: "repo",
      organization: "org",
      project: "project",
    };

    const strategy = getPRStrategy(repoInfo);
    assert.ok(strategy instanceof AzurePRStrategy);
  });
});
