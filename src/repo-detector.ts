export type RepoType = "github" | "azure-devops";

export interface RepoInfo {
  type: RepoType;
  gitUrl: string;
  owner: string;
  repo: string;
  // Azure DevOps specific
  organization?: string;
  project?: string;
}

export function detectRepoType(gitUrl: string): RepoType {
  // Check for Azure DevOps SSH format: git@ssh.dev.azure.com:...
  // Use broader pattern to catch malformed Azure URLs
  if (/^git@ssh\.dev\.azure\.com:/.test(gitUrl)) {
    return "azure-devops";
  }
  // Check for Azure DevOps HTTPS format: https://dev.azure.com/...
  if (/^https?:\/\/dev\.azure\.com\//.test(gitUrl)) {
    return "azure-devops";
  }
  return "github";
}

export function parseGitUrl(gitUrl: string): RepoInfo {
  const type = detectRepoType(gitUrl);

  if (type === "azure-devops") {
    return parseAzureDevOpsUrl(gitUrl);
  }

  return parseGitHubUrl(gitUrl);
}

function parseGitHubUrl(gitUrl: string): RepoInfo {
  // Handle SSH format: git@github.com:owner/repo.git
  // Use (.+?) with end anchor to handle repo names with dots (e.g., my.repo.git)
  const sshMatch = gitUrl.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return {
      type: "github",
      gitUrl,
      owner: sshMatch[1],
      repo: sshMatch[2],
    };
  }

  // Handle HTTPS format: https://github.com/owner/repo.git
  // Use (.+?) with end anchor to handle repo names with dots
  const httpsMatch = gitUrl.match(
    /https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
  );
  if (httpsMatch) {
    return {
      type: "github",
      gitUrl,
      owner: httpsMatch[1],
      repo: httpsMatch[2],
    };
  }

  throw new Error(`Unable to parse GitHub URL: ${gitUrl}`);
}

function parseAzureDevOpsUrl(gitUrl: string): RepoInfo {
  // Handle SSH format: git@ssh.dev.azure.com:v3/organization/project/repo
  // Use (.+?) with end anchor to handle repo names with dots
  const sshMatch = gitUrl.match(
    /git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/,
  );
  if (sshMatch) {
    return {
      type: "azure-devops",
      gitUrl,
      owner: sshMatch[1],
      repo: sshMatch[3],
      organization: sshMatch[1],
      project: sshMatch[2],
    };
  }

  // Handle HTTPS format: https://dev.azure.com/organization/project/_git/repo
  // Use (.+?) with end anchor to handle repo names with dots
  const httpsMatch = gitUrl.match(
    /https?:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/(.+?)(?:\.git)?$/,
  );
  if (httpsMatch) {
    return {
      type: "azure-devops",
      gitUrl,
      owner: httpsMatch[1],
      repo: httpsMatch[3],
      organization: httpsMatch[1],
      project: httpsMatch[2],
    };
  }

  throw new Error(`Unable to parse Azure DevOps URL: ${gitUrl}`);
}

export function getRepoDisplayName(repoInfo: RepoInfo): string {
  if (repoInfo.type === "azure-devops") {
    return `${repoInfo.organization}/${repoInfo.project}/${repoInfo.repo}`;
  }
  return `${repoInfo.owner}/${repoInfo.repo}`;
}
