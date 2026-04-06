/**
 * EPUB paginator for splitting chapter content into pages.
 * 
 * This module provides pure functions for calculating page boundaries,
 * splitting content by word count while respecting paragraph breaks,
 * and retrieving page content across chapters.
 */

import { Chapter } from './types';

/**
 * Options for pagination (currently only wordsPerPage)
 */
export interface PaginationOptions {
  /** Words per page (default: 300) */
  wordsPerPage?: number;
}

const DEFAULT_WORDS_PER_PAGE = 300;

/**
 * Strips HTML tags from a string for word counting.
 * Preserves whitespace to maintain word boundaries.
 */
export function stripHtmlTags(html: string): string {
  // Replace tags with a space, then collapse multiple spaces into one
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Counts words in a text string.
 * A word is defined as a sequence of alphanumeric characters (including Unicode).
 */
export function countWords(text: string): number {
  // Split by whitespace, keep only tokens that contain at least one Unicode letter
  const tokens = text.trim().split(/\s+/);
  const wordTokens = tokens.filter(token => /\p{L}/u.test(token));
  return wordTokens.length;
}

/**
 * Splits HTML content into paragraphs based on <p> tags and double newlines.
 * Returns an array of paragraph HTML strings (including the surrounding tags).
 */
export function splitIntoParagraphs(html: string): string[] {
  if (!html.trim()) return [];

  // First, try splitting by <p> tags (opening or closing)
  // This regex captures everything from <p[^>]*> to </p> including nested tags.
  // It's simplistic but works for typical EPUB XHTML.
  const paragraphRegex = /<p[^>]*>[\s\S]*?<\/p>/gi;
  const matches = html.match(paragraphRegex);
  if (matches && matches.length > 0) {
    return matches;
  }

  // Fallback: split by double newlines (plain text)
  return html.split(/\n\s*\n/).filter(p => p.trim().length > 0);
}

/**
 * Splits a chapter's content into pages based on words per page,
 * respecting paragraph boundaries.
 * Returns an object containing the pages array and total word count.
 */
export function splitChapterIntoPages(
  chapterContent: string,
  wordsPerPage: number = DEFAULT_WORDS_PER_PAGE
): { pages: string[]; wordCount: number } {
  if (!chapterContent || wordsPerPage <= 0) {
    return { pages: [], wordCount: 0 };
  }

  const paragraphs = splitIntoParagraphs(chapterContent);
  if (paragraphs.length === 0) {
    // No paragraphs found; treat the entire content as a single paragraph
    paragraphs.push(chapterContent);
  }

  const pages: string[] = [];
  let currentPage: string[] = [];
  let currentWordCount = 0;

  for (const paragraphHtml of paragraphs) {
    const paragraphText = stripHtmlTags(paragraphHtml);
    const paragraphWordCount = countWords(paragraphText);

    // If adding this paragraph would exceed the limit (and we already have content),
    // finalize the current page and start a new one.
    if (currentWordCount + paragraphWordCount > wordsPerPage && currentPage.length > 0) {
      pages.push(currentPage.join(''));
      currentPage = [];
      currentWordCount = 0;
    }

    currentPage.push(paragraphHtml);
    currentWordCount += paragraphWordCount;
  }

  // Add the last page if any content remains
  if (currentPage.length > 0) {
    pages.push(currentPage.join(''));
  }

  const totalWordCount = pages.reduce((sum, pageHtml) => sum + countWords(stripHtmlTags(pageHtml)), 0);
  return { pages, wordCount: totalWordCount };
}

/**
 * Calculates page boundaries for a list of chapters.
 * Returns a new array of chapters with updated startPage, endPage, wordCount,
 * and an additional `pages` property containing the split page content.
 * 
 * The page numbering is contiguous across chapters (1‑indexed).
 * Chapters without content will have startPage = endPage = previous chapter's endPage
 * (i.e., they occupy zero pages).
 */
export function calculatePages(
  chapters: Chapter[],
  wordsPerPage: number = DEFAULT_WORDS_PER_PAGE
): Chapter[] {
  if (wordsPerPage <= 0) {
    throw new Error('wordsPerPage must be positive');
  }

  const paginatedChapters: Chapter[] = [];
  let currentPageNumber = 1;

  for (const chapter of chapters) {
    const { pages, wordCount } = splitChapterIntoPages(chapter.content || '', wordsPerPage);
    const pageCount = pages.length;

    // Determine start and end pages
    let startPage = currentPageNumber;
    let endPage = currentPageNumber - 1; // zero pages by default
    if (pageCount > 0) {
      endPage = startPage + pageCount - 1;
      currentPageNumber = endPage + 1;
    } else {
      // Chapter with zero pages: occupy no page numbers
      startPage = currentPageNumber - 1;
      endPage = startPage;
    }

    // Build the updated chapter object with the extra `pages` property
    const updatedChapter: Chapter & { pages?: string[] } = {
      ...chapter,
      startPage,
      endPage,
      wordCount,
      pages,
    };

    paginatedChapters.push(updatedChapter);
  }

  return paginatedChapters;
}

/**
 * Retrieves the content of a specific page across all chapters.
 * The chapters must have been processed by `calculatePages` (i.e., contain `pages` arrays).
 * Returns an empty string if the page number is out of range.
 */
export function getPageContent(chapters: Chapter[], pageNumber: number): string {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    return '';
  }

  for (const chapter of chapters) {
    const anyChapter = chapter as any;
    const pages: string[] | undefined = anyChapter.pages;
    if (!pages || pages.length === 0) continue;

    const start = chapter.startPage;
    const end = chapter.endPage;
    if (start === undefined || end === undefined) continue;

    if (pageNumber >= start && pageNumber <= end) {
      const index = pageNumber - start;
      return pages[index] || '';
    }
  }

  return '';
}

/**
 * Returns the total number of pages across all chapters.
 * The chapters must have been processed by `calculatePages`.
 */
export function getTotalPages(chapters: Chapter[]): number {
  if (chapters.length === 0) return 0;
  const lastChapter = chapters[chapters.length - 1];
  return lastChapter.endPage || 0;
}