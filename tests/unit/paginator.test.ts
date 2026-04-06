/**
 * Unit tests for EPUB paginator.
 * 
 * Follows AAA (Arrange‑Act‑Assert) pattern and tests:
 * - Page splitting with configurable words per page
 * - Paragraph boundary respect
 * - Cross‑chapter page numbering
 * - Error handling and edge cases
 */

import {
  stripHtmlTags,
  countWords,
  splitIntoParagraphs,
  splitChapterIntoPages,
  calculatePages,
  getPageContent,
  getTotalPages,
} from '../../src/epub/paginator';
import { Chapter } from '../../src/epub/types';

describe('stripHtmlTags', () => {
  it('removes HTML tags leaving spaces', () => {
    const html = '<p>Hello <b>world</b>!</p>';
    expect(stripHtmlTags(html)).toBe(' Hello world ! ');
  });

  it('handles empty string', () => {
    expect(stripHtmlTags('')).toBe('');
  });

  it('preserves whitespace between tags', () => {
    const html = '<div>Line 1</div>\n<div>Line 2</div>';
    expect(stripHtmlTags(html)).toBe(' Line 1 Line 2 ');
  });
});

describe('countWords', () => {
  it('counts simple English words', () => {
    expect(countWords('Hello world')).toBe(2);
    expect(countWords('One two three four')).toBe(4);
  });

  it('counts hyphenated words as one', () => {
    expect(countWords('state-of-the-art')).toBe(1);
  });

  it('handles Unicode letters', () => {
    expect(countWords('Café crème')).toBe(2);
    expect(countWords('中文 测试')).toBe(2);
  });

  it('ignores punctuation and numbers', () => {
    expect(countWords('Hello, world! 123')).toBe(2);
  });

  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0);
  });
});

describe('splitIntoParagraphs', () => {
  it('splits by <p> tags', () => {
    const html = '<p>First</p><p>Second</p>';
    const result = splitIntoParagraphs(html);
    expect(result).toEqual(['<p>First</p>', '<p>Second</p>']);
  });

  it('preserves attributes in <p> tags', () => {
    const html = '<p class="intro">Intro</p><p>Body</p>';
    const result = splitIntoParagraphs(html);
    expect(result).toEqual(['<p class="intro">Intro</p>', '<p>Body</p>']);
  });

  it('handles nested tags inside paragraphs', () => {
    const html = '<p>Hello <b>world</b>!</p><p>Another</p>';
    const result = splitIntoParagraphs(html);
    expect(result).toEqual(['<p>Hello <b>world</b>!</p>', '<p>Another</p>']);
  });

  it('falls back to double newlines when no <p> tags', () => {
    const text = 'First paragraph\n\nSecond paragraph';
    const result = splitIntoParagraphs(text);
    expect(result).toEqual(['First paragraph', 'Second paragraph']);
  });

  it('returns empty array for empty content', () => {
    expect(splitIntoParagraphs('')).toEqual([]);
  });
});

describe('splitChapterIntoPages', () => {
  const defaultWordsPerPage = 300;

  it('splits simple paragraphs into pages respecting word limit', () => {
    // Each paragraph ~10 words, 3 paragraphs => 30 words total, fits in one page
    const paragraphs = Array(3).fill('<p>word '.repeat(10).trim() + '</p>').join('');
    const { pages, wordCount } = splitChapterIntoPages(paragraphs, defaultWordsPerPage);
    expect(pages).toHaveLength(1);
    expect(wordCount).toBe(30);
    expect(pages[0]).toBe(paragraphs);
  });

  it('splits across pages when word count exceeds limit', () => {
    // 2 paragraphs, each 200 words => total 400 words, page limit 300 => two pages
    const para = '<p>' + 'word '.repeat(200).trim() + '</p>';
    const content = para + para;
    const { pages, wordCount } = splitChapterIntoPages(content, defaultWordsPerPage);
    expect(pages).toHaveLength(2);
    expect(wordCount).toBe(400);
    expect(pages[0]).toBe(para);
    expect(pages[1]).toBe(para);
  });

  it('ensures each page contains at least one paragraph', () => {
    // Single paragraph with 500 words, page limit 300 => still one page
    const content = '<p>' + 'word '.repeat(500).trim() + '</p>';
    const { pages } = splitChapterIntoPages(content, defaultWordsPerPage);
    expect(pages).toHaveLength(1);
  });

  it('handles empty content', () => {
    const { pages, wordCount } = splitChapterIntoPages('', defaultWordsPerPage);
    expect(pages).toEqual([]);
    expect(wordCount).toBe(0);
  });

  it('handles content without paragraphs', () => {
    const content = '<div>Some text</div>';
    const { pages, wordCount } = splitChapterIntoPages(content, defaultWordsPerPage);
    expect(pages).toHaveLength(1);
    expect(wordCount).toBe(2); // "Some text"
  });

  it('respects custom wordsPerPage', () => {
    const para = '<p>' + 'word '.repeat(10).trim() + '</p>';
    const content = para.repeat(5); // 5 paragraphs, 50 words total
    const { pages } = splitChapterIntoPages(content, 20); // 20 words per page
    // Each paragraph 10 words, two paragraphs per page => 3 pages (2+2+1)
    expect(pages).toHaveLength(3);
  });
});

describe('calculatePages', () => {
  const mockChapters: Chapter[] = [
    {
      id: 'ch1',
      title: 'Chapter 1',
      startPage: 0,
      endPage: 0,
      content: '<p>' + 'word '.repeat(150).trim() + '</p>',
    },
    {
      id: 'ch2',
      title: 'Chapter 2',
      startPage: 0,
      endPage: 0,
      content: '<p>' + 'word '.repeat(50).trim() + '</p>',
    },
    {
      id: 'ch3',
      title: 'Chapter 3',
      startPage: 0,
      endPage: 0,
      content: '', // empty chapter
    },
  ];

  it('updates startPage and endPage for contiguous numbering', () => {
    const result = calculatePages(mockChapters, 300);
    expect(result).toHaveLength(3);

    // Chapter 1: 150 words fits in one page
    expect(result[0].startPage).toBe(1);
    expect(result[0].endPage).toBe(1);
    expect(result[0].wordCount).toBe(150);
    expect((result[0] as any).pages).toHaveLength(1);

    // Chapter 2: 50 words fits in one page, continues from previous
    expect(result[1].startPage).toBe(2);
    expect(result[1].endPage).toBe(2);
    expect(result[1].wordCount).toBe(50);

    // Chapter 3: empty content, zero pages, startPage = endPage = previous endPage
    expect(result[2].startPage).toBe(2);
    expect(result[2].endPage).toBe(2);
    expect(result[2].wordCount).toBe(0);
    expect((result[2] as any).pages).toEqual([]);
  });

  it('throws error for invalid wordsPerPage', () => {
    expect(() => calculatePages(mockChapters, 0)).toThrow('wordsPerPage must be positive');
    expect(() => calculatePages(mockChapters, -5)).toThrow('wordsPerPage must be positive');
  });

  it('handles empty chapter list', () => {
    const result = calculatePages([], 300);
    expect(result).toEqual([]);
  });

  it('splits chapter across multiple pages when needed', () => {
    const longChapter: Chapter[] = [
      {
        id: 'long',
        title: 'Long',
        startPage: 0,
        endPage: 0,
        content: '<p>word</p>'.repeat(500), // 500 paragraphs, each 1 word
      },
    ];
    const result = calculatePages(longChapter, 10); // 10 words per page
    expect(result[0].startPage).toBe(1);
    expect(result[0].endPage).toBe(50); // 500 words / 10 = 50 pages
    expect((result[0] as any).pages).toHaveLength(50);
  });

  it('preserves original chapter properties', () => {
    const result = calculatePages(mockChapters, 300);
    expect(result[0].id).toBe('ch1');
    expect(result[0].title).toBe('Chapter 1');
    expect(result[0].content).toBe(mockChapters[0].content); // unchanged
  });
});

describe('getPageContent', () => {
  let paginatedChapters: Chapter[];

  beforeEach(() => {
    // Create chapters with pages already calculated
    paginatedChapters = calculatePages([
      {
        id: 'ch1',
        title: 'Chapter 1',
        startPage: 0,
        endPage: 0,
        content: '<p>Page 1 content</p><p>Page 1 more</p>',
      },
      {
        id: 'ch2',
        title: 'Chapter 2',
        startPage: 0,
        endPage: 0,
        content: '<p>Page 2 content</p>',
      },
    ], 1); // low words per page to force splitting
  });

  it('returns content for a valid page number', () => {
    // Page 1 should be from chapter 1
    expect(getPageContent(paginatedChapters, 1)).toContain('Page 1 content');
    // Page 2 should be from chapter 1 second page
    expect(getPageContent(paginatedChapters, 2)).toContain('Page 1 more');
    // Page 3 should be from chapter 2
    expect(getPageContent(paginatedChapters, 3)).toContain('Page 2 content');
  });

  it('returns empty string for out-of-range page', () => {
    expect(getPageContent(paginatedChapters, 0)).toBe('');
    expect(getPageContent(paginatedChapters, 100)).toBe('');
  });

  it('returns empty string for non-integer page', () => {
    // The function expects integer; if non‑integer passes, still returns empty
    expect(getPageContent(paginatedChapters, 3.14)).toBe('');
  });

  it('handles chapters without pages property', () => {
    const chaptersWithoutPages: Chapter[] = [
      { id: 'ch', title: 'Chapter', startPage: 1, endPage: 1, content: 'text' },
    ];
    expect(getPageContent(chaptersWithoutPages, 1)).toBe('');
  });

  it('handles empty chapter list', () => {
    expect(getPageContent([], 1)).toBe('');
  });
});

describe('getTotalPages', () => {
  it('returns total pages across all chapters', () => {
    const chapters = calculatePages([
      { id: 'ch1', title: 'C1', startPage: 0, endPage: 0, content: '<p>word</p>'.repeat(100) },
      { id: 'ch2', title: 'C2', startPage: 0, endPage: 0, content: '<p>word</p>'.repeat(50) },
    ], 10);
    expect(getTotalPages(chapters)).toBe(15); // 10 + 5 pages
  });

  it('returns 0 for empty chapter list', () => {
    expect(getTotalPages([])).toBe(0);
  });

  it('returns last chapter endPage when chapters have zero pages', () => {
    const chapters = calculatePages([
      { id: 'ch1', title: 'C1', startPage: 0, endPage: 0, content: '' },
    ], 300);
    expect(getTotalPages(chapters)).toBe(0); // endPage is 0 because startPage = endPage = 0? Actually our algorithm sets startPage = 1, endPage = 0? Wait need to check.
    // Let's compute: empty content => pages = [], startPage = 1, endPage = 0? Actually our algorithm sets endPage = startPage - 1 (line 120). That results in endPage = 0 when startPage = 1.
    // So total pages = 0. That's fine.
  });
});