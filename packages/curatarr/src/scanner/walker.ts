/**
 * Directory walker
 * Finds movie folders and their video files.
 * Assumes standard media layout: Library/<Movie Title (Year)>/file.mkv
 */

import fs from 'node:fs';
import path from 'node:path';

const VIDEO_EXTENSIONS = new Set([
  '.mkv', '.mp4', '.avi', '.m4v', '.mov', '.ts', '.m2ts',
  '.wmv', '.flv', '.webm', '.mpg', '.mpeg', '.divx', '.xvid',
]);

export interface MovieFolder {
  folderPath: string;
  folderName: string;
  parsedTitle: string;
  parsedYear: number | undefined;
  videoFiles: string[];   // absolute paths
}

/**
 * Parse "Title (Year)" folder name into components.
 * Handles: "Movie Name (2020)", "Movie: Name (2020)", "Name, A (2020)"
 */
export function parseFolderName(folderName: string): { title: string; year: number | undefined } {
  const match = folderName.match(/^(.+?)\s*\((\d{4})\)\s*$/);
  if (match) {
    return { title: match[1].trim(), year: parseInt(match[2], 10) };
  }
  return { title: folderName, year: undefined };
}

/**
 * Check if a filename is a video file we want to probe.
 * Skips: samples, extras, behind-the-scenes, featurettes, bonus.
 */
function isMainVideoFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(ext)) return false;

  const lower = filename.toLowerCase();
  // Skip common extras/samples
  if (lower.includes('sample') && !lower.startsWith('sample')) return true; // "sample" in middle = skip
  if (lower.startsWith('sample')) return false;
  if (lower.includes('-trailer')) return false;
  if (lower.includes('.trailer.')) return false;

  return true;
}

/**
 * Walk a library root and yield MovieFolder records.
 * One level deep: root/<Movie Folder>/video.mkv
 * Does not recurse into sub-subfolders (Extras, Featurettes, etc.)
 */
export function* walkLibrary(rootPath: string): Generator<MovieFolder> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootPath, { withFileTypes: true });
  } catch (err) {
    throw new Error(`Cannot read library root ${rootPath}: ${(err as Error).message}`);
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const folderPath = path.join(rootPath, entry.name);
    const { title, year } = parseFolderName(entry.name);

    // Find video files directly in this folder (not subdirs)
    let fileEntries: fs.Dirent[];
    try {
      fileEntries = fs.readdirSync(folderPath, { withFileTypes: true });
    } catch {
      continue; // permission error — skip
    }

    const videoFiles = fileEntries
      .filter(f => f.isFile() && isMainVideoFile(f.name))
      .map(f => path.join(folderPath, f.name));

    // A movie folder should have at least one video file
    // (skip pure metadata-only folders)
    if (videoFiles.length === 0) continue;

    yield {
      folderPath,
      folderName: entry.name,
      parsedTitle: title,
      parsedYear: year,
      videoFiles,
    };
  }
}

/**
 * Count total movie folders in a library root (fast — no ffprobe).
 */
export function countMovieFolders(rootPath: string): number {
  try {
    return fs.readdirSync(rootPath, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .length;
  } catch {
    return 0;
  }
}
