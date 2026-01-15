import { execSync } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { escapeShellArg } from "../shell-utils.js";
import { AzureDevOpsRepoInfo } from "../repo-detector.js";
import { PRResult } from "../pr-creator.js";
import { BasePRStrategy, PRStrategyOptions } from "./pr-strategy.js";
import { logger } from "../logger.js";

export class AzurePRStrategy extends BasePRStrategy {
  private repoInfo: AzureDevOpsRepoInfo;

  constructor(repoInfo: AzureDevOpsRepoInfo) {
    super();
    this.repoInfo = repoInfo;
    this.bodyFilePath = ".pr-description.md";
  }

  private get orgUrl(): string {
    return `https://dev.azure.com/${encodeURIComponent(this.repoInfo.organization)}`;
  }

  private buildPRUrl(prId: string): string {
    return `https://dev.azure.com/${encodeURIComponent(this.repoInfo.organization)}/${encodeURIComponent(this.repoInfo.project)}/_git/${encodeURIComponent(this.repoInfo.repo)}/pullrequest/${prId}`;
  }

  async checkExistingPR(options: PRStrategyOptions): Promise<string | null> {
    const { branchName, baseBranch, workDir } = options;

    try {
      const existingPRId = execSync(
        `az repos pr list --repository ${escapeShellArg(this.repoInfo.repo)} --source-branch ${escapeShellArg(branchName)} --target-branch ${escapeShellArg(baseBranch)} --org ${escapeShellArg(this.orgUrl)} --project ${escapeShellArg(this.repoInfo.project)} --query "[0].pullRequestId" -o tsv`,
        { cwd: workDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();

      return existingPRId ? this.buildPRUrl(existingPRId) : null;
    } catch (error) {
      // Log unexpected errors for debugging (expected: empty result means no PR)
      if (error instanceof Error) {
        const stderr = (error as { stderr?: string }).stderr ?? "";
        if (stderr && !stderr.includes("does not exist")) {
          logger.info(`Debug: Azure PR check failed - ${stderr.trim()}`);
        }
      }
      return null;
    }
  }

  async create(options: PRStrategyOptions): Promise<PRResult> {
    const { title, body, branchName, baseBranch, workDir } = options;

    // Write description to temp file to avoid shell escaping issues
    const descFile = join(workDir, this.bodyFilePath);
    writeFileSync(descFile, body, "utf-8");

    try {
      const prId = execSync(
        `az repos pr create --repository ${escapeShellArg(this.repoInfo.repo)} --source-branch ${escapeShellArg(branchName)} --target-branch ${escapeShellArg(baseBranch)} --title ${escapeShellArg(title)} --description @${escapeShellArg(descFile)} --org ${escapeShellArg(this.orgUrl)} --project ${escapeShellArg(this.repoInfo.project)} --query "pullRequestId" -o tsv`,
        { cwd: workDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();

      return {
        url: this.buildPRUrl(prId),
        success: true,
        message: "PR created successfully",
      };
    } finally {
      // Clean up temp file
      if (existsSync(descFile)) {
        unlinkSync(descFile);
      }
    }
  }
}
