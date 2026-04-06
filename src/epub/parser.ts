/**
 * EPUB parser using julien-c/epub library
 * 
 * This module provides a functional interface for parsing EPUB files and
 * extracting metadata, table of contents, chapter content, and footnotes.
 */

import EPub = require('epub');
import { ParsedEpub, BookMetadata, TOCEntry, Chapter, Footnote } from './types';

/**
 * Error types for EPUB parsing failures
 */
export class EpubParseError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
    public readonly filePath?: string
  ) {
    super(message);
    this.name = 'EpubParseError';
  }
}

export class FileNotFoundError extends EpubParseError {
  constructor(filePath: string, cause?: Error) {
    super(`EPUB file not found: ${filePath}`, cause, filePath);
    this.name = 'FileNotFoundError';
  }
}

export class InvalidEpubError extends EpubParseError {
  constructor(filePath: string, cause?: Error) {
    super(`Invalid or corrupt EPUB file: ${filePath}`, cause, filePath);
    this.name = 'InvalidEpubError';
  }
}

export class InvalidFileTypeError extends EpubParseError {
  constructor(filePath: string, reason: string) {
    super(`Invalid file type for EPUB: ${filePath}. ${reason}`, undefined, filePath);
    this.name = 'InvalidFileTypeError';
  }
}

export class MissingMetadataError extends EpubParseError {
  constructor(filePath: string, field: string) {
    super(`Missing required metadata field '${field}' in EPUB: ${filePath}`, undefined, filePath);
    this.name = 'MissingMetadataError';
  }
}

/**
 * Options for parsing EPUB files
 */
export interface ParseOptions {
  /** Maximum file size in bytes (default: 50MB) */
  maxFileSizeBytes?: number;
  /** Whether to extract footnotes (default: true) */
  extractFootnotes?: boolean;
  /** Whether to fetch chapter content (default: true) */
  fetchChapterContent?: boolean;
}

const DEFAULT_OPTIONS: Required<ParseOptions> = {
  maxFileSizeBytes: 50 * 1024 * 1024, // 50MB
  extractFootnotes: true,
  fetchChapterContent: true,
};

/**
 * ZIP magic bytes (first 4 bytes of a valid ZIP file)
 * EPUB files are ZIP archives, so they must start with these bytes.
 */
const ZIP_MAGIC_BYTES = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04

/**
 * Validates file existence, type, and size before parsing.
 * - Checks file extension is .epub
 * - Verifies ZIP magic bytes (PK\x03\x04)
 * - Validates file size is within limits
 */
async function validateFile(filePath: string, maxSizeBytes: number): Promise<void> {
  const fs = await import('fs/promises');
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw new FileNotFoundError(filePath);
    }

    // Check file extension
    const normalizedPath = filePath.toLowerCase();
    if (!normalizedPath.endsWith('.epub')) {
      throw new InvalidFileTypeError(filePath, 'File must have .epub extension');
    }

    // Verify ZIP magic bytes (EPUB is a ZIP archive)
    if (stats.size >= 4) {
      const buffer = Buffer.alloc(4);
      const fileHandle = await fs.open(filePath, 'r');
      try {
        await fileHandle.read(buffer, 0, 4, 0);
        const bytes = Array.from(buffer);
        const isValidZip = bytes.every((byte, index) => byte === ZIP_MAGIC_BYTES[index]);
        if (!isValidZip) {
          throw new InvalidFileTypeError(filePath, 'File is not a valid ZIP/EPUB archive');
        }
      } finally {
        await fileHandle.close();
      }
    } else {
      throw new InvalidFileTypeError(filePath, 'File is too small to be a valid EPUB');
    }

    // Check file size
    if (stats.size > maxSizeBytes) {
      throw new EpubParseError(`EPUB file too large: ${stats.size} bytes exceeds limit of ${maxSizeBytes} bytes`, undefined, filePath);
    }
  } catch (error: any) {
    if (error instanceof FileNotFoundError || 
        error instanceof InvalidFileTypeError ||
        error instanceof EpubParseError) {
      throw error;
    }
    if (error.code === 'ENOENT') {
      throw new FileNotFoundError(filePath, error);
    }
    throw error;
  }
}

/**
 * Maps epub library metadata to our BookMetadata type
 */
function mapMetadata(epub: EPub, totalChapters: number): BookMetadata {
  const meta = epub.metadata as any;
  // Required fields: title, totalPages, totalChapters
  // Title is required; if missing, we'll fall back to 'Untitled'
  const title = meta.title || 'Untitled';
  // For EPUBs, page count is not fixed; we use totalChapters as a placeholder
  const totalPages = totalChapters;
  
  return {
    title,
    author: meta.creator,
    publisher: meta.publisher,
    isbn: meta.ISBN,
    language: meta.language,
    pubDate: meta.date,
    description: meta.description,
    coverImageId: meta.cover,
    totalPages,
    totalChapters,
  };
}

/**
 * Builds hierarchical TOC from flat list with level indicators
 */
function buildTocHierarchy(items: Array<{ id: string; title: string; level: number; href: string; order: number }>): TOCEntry[] {
  const toc: TOCEntry[] = [];
  const stack: Array<{ entry: TOCEntry; level: number }> = [];

  for (const item of items.sort((a, b) => a.order - b.order)) {
    const entry: TOCEntry = {
      id: item.id,
      title: item.title,
      level: item.level,
      href: item.href,
      children: [],
    };

    // Find appropriate parent based on level
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      // Root level
      toc.push(entry);
    } else {
      // Add as child of current parent
      const parent = stack[stack.length - 1];
      parent.entry.children!.push(entry);
    }

    stack.push({ entry, level: item.level });
  }

  return toc;
}

/**
 * Extracts footnotes from raw chapter HTML using regex matching.
 * This is a simple implementation that looks for <aside epub:type="footnote"> elements.
 * For production use, consider using a proper HTML parser like cheerio.
 */
function extractFootnotesFromHtml(rawHtml: string, sourceChapter?: string): Footnote[] {
  const footnotes: Footnote[] = [];
  // Regex to match <aside epub:type="footnote" id="..."> ... </aside>
  // Note: This regex may not handle all edge cases (e.g., nested tags).
  const footnoteRegex = /<aside[^>]*epub:type="footnote"[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/aside>/g;
  let match;
  while ((match = footnoteRegex.exec(rawHtml)) !== null) {
    const [, id, content] = match;
    footnotes.push({
      id,
      content: content.trim(),
      page: 0, // Page unknown at parse time; will be populated later during reading
      sourceChapter,
    });
  }
  return footnotes;
}

/**
 * Promisifies a callback-style EPUB chapter reader.
 *
 * The `epub` package exposes `getChapter` / `getChapterRaw` as callback APIs,
 * so we wrap them to use async/await safely without assuming Promise support.
 */
function readEpubChapter<T>(
  reader: (chapterId: string, callback: (error: Error | null, data?: T) => void) => unknown,
  chapterId: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const finish = (error: Error | null, data?: T): void => {
      if (settled) {
        return;
      }
      settled = true;

      if (error) {
        reject(error);
        return;
      }

      resolve(data as T);
    };

    try {
      const maybePromise = reader(chapterId, finish);

      if (maybePromise && typeof (maybePromise as Promise<T>).then === 'function') {
        (maybePromise as Promise<T>)
          .then((data) => finish(null, data))
          .catch((error: unknown) => {
            finish(error instanceof Error ? error : new Error(String(error)));
          });
      }
    } catch (error: unknown) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * Main EPUB parsing function
 */
export async function parseEpub(filePath: string, options: ParseOptions = {}): Promise<ParsedEpub> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 1. Validate file
  await validateFile(filePath, opts.maxFileSizeBytes);

  // 2. Parse EPUB with event-driven API wrapped in a Promise
  const epub = new EPub(filePath, '/images/', '/chapters/');
  
  return new Promise<ParsedEpub>((resolve, reject) => {
    epub.on('error', (error: Error) => {
      if (error.message.includes('no such file')) {
        reject(new FileNotFoundError(filePath, error));
      } else {
        reject(new InvalidEpubError(filePath, error));
      }
    });

    epub.on('end', async () => {
      try {
        // 3. Extract metadata
        const totalChapters = epub.flow.length;
        const metadata = mapMetadata(epub, totalChapters);

        // 4. Build TOC hierarchy
        const toc = buildTocHierarchy(epub.toc);

        // 5. Process chapters
        const chapters: Chapter[] = [];
        const footnotes: Footnote[] = [];

        const epubAny = epub as any;
        for (const flowItem of epub.flow) {
          let content: string | undefined;
          let rawContent: string | undefined;

          if (opts.fetchChapterContent) {
            content = await readEpubChapter<string>(epubAny.getChapter.bind(epubAny), flowItem.id);
            rawContent = await readEpubChapter<string>(epubAny.getChapterRaw.bind(epubAny), flowItem.id);
          }

          const chapter: Chapter = {
            id: flowItem.id,
            title: flowItem.href, // TODO: map to TOC title if possible
            startPage: 0, // Page mapping not available at parse time
            endPage: 0,
            content,
          };

          chapters.push(chapter);

          // Extract footnotes from raw content if available
          if (opts.extractFootnotes && rawContent) {
            const chapterFootnotes = extractFootnotesFromHtml(rawContent, flowItem.id);
            footnotes.push(...chapterFootnotes);
          }
        }

        // 6. Return parsed result
        resolve({
          metadata,
          toc,
          chapters,
          footnotes,
        });
      } catch (error: any) {
        reject(new EpubParseError(`Failed to process EPUB: ${error.message}`, error, filePath));
      }
    });

    // Start parsing
    epub.parse();
  });
}
