import { existsSync } from "node:fs";
import { join } from "node:path";
import { RepoConfig, FileContent, convertContentToString } from "./config.js";
import { RepoInfo, getRepoDisplayName } from "./repo-detector.js";
import { GitOps, GitOpsOptions } from "./git-ops.js";
import { createPR, PRResult, FileAction } from "./pr-creator.js";
import { logger, ILogger } from "./logger.js";

export interface ProcessorOptions {
  branchName: string;
  workDir: string;
  dryRun?: boolean;
  /** Number of retries for network operations (default: 3) */
  retries?: number;
}

/**
 * Factory function type for creating GitOps instances.
 * Allows dependency injection for testing.
 */
export type GitOpsFactory = (options: GitOpsOptions) => GitOps;

export interface ProcessorResult {
  success: boolean;
  repoName: string;
  message: string;
  prUrl?: string;
  skipped?: boolean;
}

export class RepositoryProcessor {
  private gitOps: GitOps | null = null;
  private readonly gitOpsFactory: GitOpsFactory;
  private readonly log: ILogger;

  /**
   * Creates a new RepositoryProcessor.
   * @param gitOpsFactory - Optional factory for creating GitOps instances (for testing)
   * @param log - Optional logger instance (for testing)
   */
  constructor(gitOpsFactory?: GitOpsFactory, log?: ILogger) {
    this.gitOpsFactory = gitOpsFactory ?? ((opts) => new GitOps(opts));
    this.log = log ?? logger;
  }

  async process(
    repoConfig: RepoConfig,
    repoInfo: RepoInfo,
    options: ProcessorOptions,
  ): Promise<ProcessorResult> {
    const repoName = getRepoDisplayName(repoInfo);
    const { branchName, workDir, dryRun, retries } = options;

    this.gitOps = this.gitOpsFactory({ workDir, dryRun, retries });

    try {
      // Step 1: Clean workspace
      this.log.info("Cleaning workspace...");
      this.gitOps.cleanWorkspace();

      // Step 2: Clone repo
      this.log.info("Cloning repository...");
      await this.gitOps.clone(repoInfo.gitUrl);

      // Step 3: Get default branch for PR base
      const { branch: baseBranch, method: detectionMethod } =
        await this.gitOps.getDefaultBranch();
      this.log.info(
        `Default branch: ${baseBranch} (detected via ${detectionMethod})`,
      );

      // Step 4: Create/checkout branch
      this.log.info(`Switching to branch: ${branchName}`);
      await this.gitOps.createBranch(branchName);

      // Step 5: Write all config files and track changes
      const changedFiles: FileAction[] = [];

      for (const file of repoConfig.files) {
        this.log.info(`Writing ${file.fileName}...`);
        const fileContent = convertContentToString(file.content, file.fileName);
        const filePath = join(workDir, file.fileName);

        // Determine action type (create vs update)
        const action: "create" | "update" = existsSync(filePath)
          ? "update"
          : "create";

        if (dryRun) {
          // In dry-run, check if file would change without writing
          if (this.gitOps.wouldChange(file.fileName, fileContent)) {
            changedFiles.push({ fileName: file.fileName, action });
          }
        } else {
          // Write the file
          this.gitOps.writeFile(file.fileName, fileContent);
        }
      }

      // Step 6: Check for changes
      let hasChanges: boolean;
      if (dryRun) {
        hasChanges = changedFiles.length > 0;
      } else {
        hasChanges = await this.gitOps.hasChanges();
        // If there are changes, determine which files changed
        if (hasChanges) {
          // Rebuild the changed files list by checking git status
          // For simplicity, we include all files with their detected actions
          for (const file of repoConfig.files) {
            const filePath = join(workDir, file.fileName);
            // We check if file existed before writing (action was determined above)
            // Since we don't have pre-write state, we'll mark all files that are in the commit
            // A more accurate approach would track this before writing, but for now
            // we'll assume all files are being synced and include them all
            const action: "create" | "update" = existsSync(filePath)
              ? "update"
              : "create";
            changedFiles.push({ fileName: file.fileName, action });
          }
        }
      }

      if (!hasChanges) {
        return {
          success: true,
          repoName,
          message: "No changes detected",
          skipped: true,
        };
      }

      // Step 7: Commit
      this.log.info("Committing changes...");
      const commitMessage = this.formatCommitMessage(changedFiles);
      await this.gitOps.commit(commitMessage);

      // Step 8: Push
      this.log.info("Pushing to remote...");
      await this.gitOps.push(branchName);

      // Step 9: Create PR
      this.log.info("Creating pull request...");
      const prResult: PRResult = await createPR({
        repoInfo,
        branchName,
        baseBranch,
        files: changedFiles,
        workDir,
        dryRun,
        retries,
      });

      return {
        success: prResult.success,
        repoName,
        message: prResult.message,
        prUrl: prResult.url,
      };
    } finally {
      // Always cleanup workspace on completion or failure
      if (this.gitOps) {
        try {
          this.gitOps.cleanWorkspace();
        } catch {
          // Ignore cleanup errors - best effort
        }
      }
    }
  }

  /**
   * Format commit message based on files changed
   */
  private formatCommitMessage(files: FileAction[]): string {
    if (files.length === 1) {
      return `chore: sync ${files[0].fileName}`;
    }

    if (files.length <= 3) {
      const fileNames = files.map((f) => f.fileName).join(", ");
      return `chore: sync ${fileNames}`;
    }

    return `chore: sync ${files.length} config files`;
  }
}
