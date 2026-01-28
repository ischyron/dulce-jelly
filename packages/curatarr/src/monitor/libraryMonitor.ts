/**
 * Library monitor
 * Compares Jellyfin library state with filesystem
 */

import fs from 'node:fs';
import path from 'node:path';

import type { CuratarrConfig, JellyfinItem, LibraryIssue, LibraryIssueType } from '../shared/types.js';
import { JellyfinClient } from './jellyfinClient.js';

// Common video file extensions
const VIDEO_EXTENSIONS = new Set([
  '.mkv', '.mp4', '.avi', '.m4v', '.mov', '.wmv', '.flv', '.webm', '.ts', '.m2ts',
]);

interface MonitorOptions {
  batchSize?: number;
  checkDuplicates?: boolean;
  onProgress?: (message: string) => void;
}

interface MonitorResult {
  issues: LibraryIssue[];
  errors: string[];
  stats: {
    totalItems: number;
    checkedItems: number;
    missingFiles: number;
    duplicateVideos: number;
  };
}

export class LibraryMonitor {
  private jellyfin: JellyfinClient;

  constructor(private config: CuratarrConfig) {
    this.jellyfin = new JellyfinClient(config);
  }

  /**
   * Run full library monitoring check
   */
  async checkLibrary(options: MonitorOptions = {}): Promise<MonitorResult> {
    const issues: LibraryIssue[] = [];
    const stats = {
      totalItems: 0,
      checkedItems: 0,
      missingFiles: 0,
      duplicateVideos: 0,
    };

    options.onProgress?.('Fetching movies from Jellyfin...');

    const { items, errors } = await this.jellyfin.getAllMovies({
      batchSize: options.batchSize,
      onProgress: (fetched, total) => {
        options.onProgress?.(`Fetched ${fetched}/${total} items...`);
      },
    });

    stats.totalItems = items.length;

    options.onProgress?.(`Checking ${items.length} items...`);

    for (const item of items) {
      stats.checkedItems++;

      // Check if file/folder exists
      const fileIssues = await this.checkItemExists(item);
      issues.push(...fileIssues);
      stats.missingFiles += fileIssues.filter(i => i.type === 'missing_file' || i.type === 'missing_folder').length;

      // Check for duplicate video files
      if (options.checkDuplicates && item.Path) {
        const dupeIssues = await this.checkDuplicateVideos(item);
        issues.push(...dupeIssues);
        stats.duplicateVideos += dupeIssues.length;
      }
    }

    return { issues, errors, stats };
  }

  /**
   * Check if a Jellyfin item exists on filesystem
   */
  private async checkItemExists(item: JellyfinItem): Promise<LibraryIssue[]> {
    const issues: LibraryIssue[] = [];

    // Get the path - either from MediaSources or direct Path
    const filePath = item.MediaSources?.[0]?.Path || item.Path;

    if (!filePath) {
      issues.push(this.createIssue(
        'warning',
        'missing_file',
        item.Name,
        'Unknown path',
        'No path information available in Jellyfin',
        item.Id
      ));
      return issues;
    }

    // Check if path exists
    const exists = await this.pathExists(filePath);

    if (!exists) {
      // Determine if it's a file or folder issue
      const isFile = path.extname(filePath) !== '';
      const issueType: LibraryIssueType = isFile ? 'missing_file' : 'missing_folder';

      issues.push(this.createIssue(
        'error',
        issueType,
        item.Name,
        filePath,
        `${isFile ? 'File' : 'Folder'} not found on filesystem`,
        item.Id
      ));
    }

    return issues;
  }

  /**
   * Check for multiple video files in a movie folder
   */
  private async checkDuplicateVideos(item: JellyfinItem): Promise<LibraryIssue[]> {
    const issues: LibraryIssue[] = [];

    const filePath = item.MediaSources?.[0]?.Path || item.Path;
    if (!filePath) return issues;

    // Get parent folder for the video file
    const folderPath = path.dirname(filePath);

    try {
      const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
      const videoFiles = entries.filter(entry =>
        entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      );

      if (videoFiles.length > 1) {
        // Filter out sample files
        const nonSampleVideos = videoFiles.filter(f =>
          !f.name.toLowerCase().includes('sample')
        );

        if (nonSampleVideos.length > 1) {
          issues.push(this.createIssue(
            'warning',
            'multiple_video_files',
            item.Name,
            folderPath,
            `Found ${nonSampleVideos.length} video files: ${nonSampleVideos.map(f => f.name).join(', ')}`,
            item.Id
          ));
        }
      }
    } catch {
      // Folder doesn't exist or not accessible - already caught by checkItemExists
    }

    return issues;
  }

  /**
   * Check if a path exists (file or directory)
   */
  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a library issue object
   */
  private createIssue(
    severity: LibraryIssue['severity'],
    type: LibraryIssueType,
    title: string,
    itemPath: string,
    details: string,
    jellyfinId?: string
  ): LibraryIssue {
    return {
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      severity,
      type,
      title,
      path: itemPath,
      jellyfinId,
      details,
      detectedAt: new Date().toISOString(),
      resolved: false,
    };
  }
}
