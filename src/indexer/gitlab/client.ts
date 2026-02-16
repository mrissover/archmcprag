import { config } from '../../config/index.js';
import type { GitLabFile } from '../../types/index.js';
import pino from 'pino';

const logger = pino({ name: 'gitlab' });

interface GitLabTreeItem {
  id: string;
  name: string;
  type: 'tree' | 'blob';
  path: string;
  mode: string;
}

interface GitLabFileResponse {
  file_name: string;
  file_path: string;
  content: string;
  encoding: string;
  last_commit_id: string;
}

interface GitLabCommitResponse {
  id: string;
  authored_date: string;
  author_name: string;
}

export class GitLabClient {
  private baseUrl: string;
  private projectId: string;
  private accessToken: string;
  private branch: string;

  constructor() {
    this.baseUrl = config.gitlab.url;
    this.projectId = encodeURIComponent(config.gitlab.projectId);
    this.accessToken = config.gitlab.accessToken;
    this.branch = config.gitlab.branch;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}/api/v4/projects/${this.projectId}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'PRIVATE-TOKEN': this.accessToken,
      },
    });

    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async listMarkdownFiles(): Promise<string[]> {
    const files: string[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const items = await this.fetch<GitLabTreeItem[]>(
        `/repository/tree?ref=${this.branch}&recursive=true&per_page=${perPage}&page=${page}`
      );

      for (const item of items) {
        if (item.type === 'blob' && item.path.endsWith('.md')) {
          files.push(item.path);
        }
      }

      if (items.length < perPage) break;
      page++;
    }

    logger.info(`Found ${files.length} markdown files`);
    return files;
  }

  async getFile(path: string): Promise<GitLabFile> {
    const encodedPath = encodeURIComponent(path);

    const [fileData, commitData] = await Promise.all([
      this.fetch<GitLabFileResponse>(`/repository/files/${encodedPath}?ref=${this.branch}`),
      this.fetch<GitLabCommitResponse[]>(`/repository/commits?ref_name=${this.branch}&path=${encodedPath}&per_page=1`),
    ]);

    const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
    const lastCommit = commitData[0];

    return {
      path,
      content,
      last_modified: lastCommit?.authored_date || new Date().toISOString(),
      author: lastCommit?.author_name || 'unknown',
    };
  }

  async getFiles(paths: string[]): Promise<GitLabFile[]> {
    const files: GitLabFile[] = [];

    for (const path of paths) {
      try {
        const file = await this.getFile(path);
        files.push(file);
      } catch (error) {
        logger.error({ path, error }, 'Failed to fetch file');
      }
    }

    return files;
  }
}
