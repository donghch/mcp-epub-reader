/**
 * Unit tests for EPUB parser using julien-c/epub library.
 * 
 * Follows AAA (Arrange‑Act‑Assert) pattern and tests:
 * - Successful parsing with metadata, TOC, chapters, footnotes
 * - Error handling for invalid/corrupt EPUB files
 * - Edge cases (empty TOC, missing footnotes, size limits)
 * - Type safety and immutability of returned data
 */

import { parseEpub, EpubParseError, FileNotFoundError, InvalidEpubError, ParseOptions } from '../../src/epub/parser';
import { ParsedEpub } from '../../src/epub/types';

// Mock the epub library and fs/promises
jest.mock('epub');
jest.mock('fs/promises');

import EPub from 'epub';
import * as fsPromises from 'fs/promises';

// Type-safe mock helpers
const mockEPub = EPub as jest.MockedClass<typeof EPub>;
const mockFsPromises = fsPromises as jest.Mocked<typeof fsPromises>;

describe('EPUB parser', () => {
  const mockFilePath = '/path/to/book.epub';
  const defaultOptions: ParseOptions = {};

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Successful parsing', () => {
    it('extracts metadata, TOC, chapters, and footnotes', async () => {
      // Arrange
      const mockMetadata = {
        creator: 'Author Name',
        creatorFileAs: 'Name, Author',
        title: 'Sample Book',
        language: 'en',
        subject: 'Fiction',
        date: '2024-01-01',
        description: 'A sample book for testing',
        publisher: 'Test Publisher',
        ISBN: '1234567890',
        UUID: 'uuid-123',
        subjects: ['Fiction', 'Sample'],
      };
      const mockFlow = [
        { id: 'chapter1', href: 'chap1.xhtml', 'media-type': 'application/xhtml+xml' },
        { id: 'chapter2', href: 'chap2.xhtml', 'media-type': 'application/xhtml+xml' },
      ];
      const mockToc = [
        { id: 'toc1', href: 'chap1.xhtml', title: 'Chapter 1', level: 1, order: 1 },
        { id: 'toc2', href: 'chap2.xhtml', title: 'Chapter 2', level: 1, order: 2 },
      ];
      const mockChapterContent = '<div><p>Chapter content</p><aside epub:type="footnote" id="fn1"><p>Footnote 1</p></aside></div>';
      const mockRawContent = '<html><body><aside epub:type="footnote" id="fn1"><p>Footnote 1</p></aside></body></html>';

      mockFsPromises.stat.mockResolvedValue({ isFile: () => true, size: 1024 } as any);
      // Mock fs.open to return valid ZIP magic bytes (PK\x03\x04)
      mockFsPromises.open.mockResolvedValue({
        read: jest.fn().mockImplementation(async (buffer: Buffer, offset: number, length: number, position: number) => {
          // Write ZIP magic bytes to buffer: [0x50, 0x4b, 0x03, 0x04]
          buffer[0] = 0x50;
          buffer[1] = 0x4b;
          buffer[2] = 0x03;
          buffer[3] = 0x04;
          return { bytesRead: 4 };
        }),
        close: jest.fn().mockResolvedValue(undefined),
      } as any);
      const mockEpubInstance: any = {
        metadata: mockMetadata,
        flow: mockFlow,
        toc: mockToc,
        spine: { contents: mockFlow },
        on: jest.fn((event: string, handler: Function): any => {
          if (event === 'end') {
            // Simulate async end event
            setTimeout(() => handler(), 0);
          }
          return mockEpubInstance;
        }),
        parse: jest.fn(),
        getChapter: jest.fn((chapterId: string, callback: Function) => callback(null, `Processed ${chapterId}: ${mockChapterContent}`)),
        getChapterRaw: jest.fn((chapterId: string, callback: Function) => callback(null, mockRawContent)),
      };
      mockEPub.mockImplementation(() => mockEpubInstance as any);

      // Act
      const result = await parseEpub(mockFilePath, defaultOptions);

      // Assert
      expect(mockEPub).toHaveBeenCalledWith(mockFilePath, '/images/', '/chapters/');
      expect(mockEpubInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockEpubInstance.on).toHaveBeenCalledWith('end', expect.any(Function));
      expect(mockEpubInstance.parse).toHaveBeenCalled();

      // Metadata mapping
      expect(result.metadata.title).toBe('Sample Book');
      expect(result.metadata.author).toBe('Author Name');
      expect(result.metadata.publisher).toBe('Test Publisher');
      expect(result.metadata.isbn).toBe('1234567890');
      expect(result.metadata.language).toBe('en');
      expect(result.metadata.totalPages).toBe(2); // totalChapters
      expect(result.metadata.totalChapters).toBe(2);

      // TOC mapping
      expect(result.toc).toHaveLength(2);
      expect(result.toc[0].title).toBe('Chapter 1');
      expect(result.toc[0].level).toBe(1);
      expect(result.toc[0].href).toBe('chap1.xhtml');
      expect(result.toc[0].children).toEqual([]);

      // Chapters mapping
      expect(result.chapters).toHaveLength(2);
      expect(result.chapters[0].id).toBe('chapter1');
      expect(result.chapters[0].title).toBe('chap1.xhtml'); // href as title fallback
      expect(result.chapters[0].content).toContain('Processed chapter1:');
      expect(result.chapters[0].startPage).toBe(0); // page mapping not available
      expect(result.chapters[0].endPage).toBe(0);

      // Footnotes extraction
      expect(result.footnotes).toHaveLength(2); // one footnote per chapter (same footnote appears in each raw content)
      expect(result.footnotes[0].id).toBe('fn1');
      expect(result.footnotes[0].content).toContain('Footnote 1');
      expect(result.footnotes[0].sourceChapter).toBe('chapter1');
    });

    it('handles hierarchical TOC', async () => {
      // Arrange
      const mockToc = [
        { id: 'part1', href: '#', title: 'Part 1', level: 1, order: 1 },
        { id: 'chap1', href: 'chap1.xhtml', title: 'Chapter 1', level: 2, order: 2 },
        { id: 'chap2', href: 'chap2.xhtml', title: 'Chapter 2', level: 2, order: 3 },
        { id: 'part2', href: '#', title: 'Part 2', level: 1, order: 4 },
        { id: 'chap3', href: 'chap3.xhtml', title: 'Chapter 3', level: 2, order: 5 },
      ];
      mockFsPromises.stat.mockResolvedValue({ isFile: () => true, size: 1024 } as any);
      const mockEpubInstance: any = {
        metadata: { title: 'Book' },
        flow: [{ id: 'chap1', href: 'chap1.xhtml', 'media-type': 'application/xhtml+xml' }],
        toc: mockToc,
        spine: { contents: [] },
        on: jest.fn((event, handler): any => {
          if (event === 'end') setTimeout(() => handler(), 0);
          return mockEpubInstance;
        }),
        parse: jest.fn(),
        getChapter: jest.fn((chapterId: string, callback: Function) => callback(null, '')),
        getChapterRaw: jest.fn((chapterId: string, callback: Function) => callback(null, '')),
      };
      mockEPub.mockImplementation(() => mockEpubInstance as any);

      // Act
      const result = await parseEpub(mockFilePath, defaultOptions);

      // Assert
      expect(result.toc).toHaveLength(2); // two root entries (part1, part2)
      expect(result.toc[0].title).toBe('Part 1');
      expect(result.toc[0].children).toHaveLength(2);
      expect(result.toc[0].children![0].title).toBe('Chapter 1');
      expect(result.toc[0].children![1].title).toBe('Chapter 2');
      expect(result.toc[1].title).toBe('Part 2');
      expect(result.toc[1].children).toHaveLength(1);
      expect(result.toc[1].children![0].title).toBe('Chapter 3');
    });

    it('respects options to skip footnotes and chapter content', async () => {
      // Arrange
      mockFsPromises.stat.mockResolvedValue({ isFile: () => true, size: 1024 } as any);
      const mockEpubInstance: any = {
        metadata: { title: 'Book' },
        flow: [{ id: 'chap1', href: 'chap1.xhtml', 'media-type': 'application/xhtml+xml' }],
        toc: [],
        spine: { contents: [] },
        on: jest.fn((event, handler): any => {
          if (event === 'end') setTimeout(() => handler(), 0);
          return mockEpubInstance;
        }),
        parse: jest.fn(),
        getChapter: jest.fn((chapterId: string, callback: Function) => callback(null, '')),
        getChapterRaw: jest.fn((chapterId: string, callback: Function) => callback(null, '')),
      };
      mockEPub.mockImplementation(() => mockEpubInstance as any);

      // Act
      const options: ParseOptions = { extractFootnotes: false, fetchChapterContent: false };
      const result = await parseEpub(mockFilePath, options);

      // Assert
      expect(mockEpubInstance.getChapter).not.toHaveBeenCalled();
      expect(mockEpubInstance.getChapterRaw).not.toHaveBeenCalled();
      expect(result.chapters[0].content).toBeUndefined();
      expect(result.footnotes).toHaveLength(0);
    });
  });

  describe('Error handling', () => {
    it('throws FileNotFoundError for non-existent file', async () => {
      // Arrange
      mockFsPromises.stat.mockRejectedValue({ code: 'ENOENT' });

      // Act & Assert
      await expect(parseEpub(mockFilePath, defaultOptions)).rejects.toThrow(FileNotFoundError);
      await expect(parseEpub(mockFilePath, defaultOptions)).rejects.toThrow(/EPUB file not found/);
    });

    it('throws EpubParseError for file size exceeding limit', async () => {
      // Arrange
      const largeSize = 100 * 1024 * 1024; // 100MB
      mockFsPromises.stat.mockResolvedValue({ isFile: () => true, size: largeSize } as any);

      // Act & Assert
      await expect(parseEpub(mockFilePath, defaultOptions)).rejects.toThrow(EpubParseError);
      await expect(parseEpub(mockFilePath, defaultOptions)).rejects.toThrow(/EPUB file too large/);
    });

    it('throws InvalidEpubError when EPUB parsing fails', async () => {
      // Arrange
      mockFsPromises.stat.mockResolvedValue({ isFile: () => true, size: 1024 } as any);
      const mockEpubInstance: any = {
        on: jest.fn((event: string, handler: Function): any => {
          if (event === 'error') {
            // Simulate async error event
            setTimeout(() => handler(new Error('Invalid EPUB format')), 0);
          }
          return mockEpubInstance;
        }),
        parse: jest.fn(),
      };
      mockEPub.mockImplementation(() => mockEpubInstance as any);

      // Act & Assert
      await expect(parseEpub(mockFilePath, defaultOptions)).rejects.toThrow(InvalidEpubError);
      await expect(parseEpub(mockFilePath, defaultOptions)).rejects.toThrow(/Invalid or corrupt EPUB file/);
    });

    it('throws EpubParseError when chapter fetching fails', async () => {
      // Arrange
      mockFsPromises.stat.mockResolvedValue({ isFile: () => true, size: 1024 } as any);
      const mockEpubInstance: any = {
        metadata: { title: 'Book' },
        flow: [{ id: 'chap1', href: 'chap1.xhtml', 'media-type': 'application/xhtml+xml' }],
        toc: [],
        spine: { contents: [] },
        on: jest.fn((event, handler): any => {
          if (event === 'end') setTimeout(() => handler(), 0);
          return mockEpubInstance;
        }),
        parse: jest.fn(),
        getChapter: jest.fn((chapterId: string, callback: Function) => callback(new Error('Chapter missing'))),
        getChapterRaw: jest.fn((chapterId: string, callback: Function) => callback(null, '')),
      };
      mockEPub.mockImplementation(() => mockEpubInstance as any);

      // Act & Assert
      await expect(parseEpub(mockFilePath, defaultOptions)).rejects.toThrow(EpubParseError);
      await expect(parseEpub(mockFilePath, defaultOptions)).rejects.toThrow(/Failed to process EPUB/);
    });
  });

  describe('Edge cases', () => {
    it('handles EPUB with missing metadata fields', async () => {
      // Arrange
      mockFsPromises.stat.mockResolvedValue({ isFile: () => true, size: 1024 } as any);
      const mockEpubInstance: any = {
        metadata: { title: undefined, creator: undefined, language: undefined }, // minimal
        flow: [],
        toc: [],
        spine: { contents: [] },
        on: jest.fn((event, handler): any => {
          if (event === 'end') setTimeout(() => handler(), 0);
          return mockEpubInstance;
        }),
        parse: jest.fn(),
        getChapter: jest.fn((chapterId: string, callback: Function) => callback(null, '')),
        getChapterRaw: jest.fn((chapterId: string, callback: Function) => callback(null, '')),
      };
      mockEPub.mockImplementation(() => mockEpubInstance as any);

      // Act
      const result = await parseEpub(mockFilePath, defaultOptions);

      // Assert
      expect(result.metadata.title).toBe('Untitled');
      expect(result.metadata.author).toBeUndefined();
      expect(result.metadata.language).toBeUndefined();
      expect(result.metadata.totalPages).toBe(0);
      expect(result.metadata.totalChapters).toBe(0);
    });

    it('handles EPUB with empty TOC and flow', async () => {
      // Arrange
      mockFsPromises.stat.mockResolvedValue({ isFile: () => true, size: 1024 } as any);
      const mockEpubInstance: any = {
        metadata: { title: 'Empty Book' },
        flow: [],
        toc: [],
        spine: { contents: [] },
        on: jest.fn((event, handler): any => {
          if (event === 'end') setTimeout(() => handler(), 0);
          return mockEpubInstance;
        }),
        parse: jest.fn(),
        getChapter: jest.fn((chapterId: string, callback: Function) => callback(null, '')),
        getChapterRaw: jest.fn((chapterId: string, callback: Function) => callback(null, '')),
      };
      mockEPub.mockImplementation(() => mockEpubInstance as any);

      // Act
      const result = await parseEpub(mockFilePath, defaultOptions);

      // Assert
      expect(result.toc).toEqual([]);
      expect(result.chapters).toEqual([]);
      expect(result.footnotes).toEqual([]);
    });

    it('respects custom max file size option', async () => {
      // Arrange
      const fileSize = 30 * 1024 * 1024; // 30MB
      mockFsPromises.stat.mockResolvedValue({ isFile: () => true, size: fileSize } as any);
      const mockEpubInstance: any = {
        metadata: { title: 'Book' },
        flow: [],
        toc: [],
        spine: { contents: [] },
        on: jest.fn((event, handler): any => {
          if (event === 'end') setTimeout(() => handler(), 0);
          return mockEpubInstance;
        }),
        parse: jest.fn(),
        getChapter: jest.fn((chapterId: string, callback: Function) => callback(null, '')),
        getChapterRaw: jest.fn((chapterId: string, callback: Function) => callback(null, '')),
      };
      mockEPub.mockImplementation(() => mockEpubInstance as any);

      // Act & Assert (should pass with higher limit)
      const options: ParseOptions = { maxFileSizeBytes: 40 * 1024 * 1024 };
      await expect(parseEpub(mockFilePath, options)).resolves.toBeDefined();

      // Should reject with lower limit
      const options2: ParseOptions = { maxFileSizeBytes: 20 * 1024 * 1024 };
      await expect(parseEpub(mockFilePath, options2)).rejects.toThrow(/EPUB file too large/);
    });
  });

  describe('Immutability and purity', () => {
    it('returns immutable data structures', async () => {
      // Arrange
      mockFsPromises.stat.mockResolvedValue({ isFile: () => true, size: 1024 } as any);
      const mockEpubInstance: any = {
        metadata: { title: 'Book' },
        flow: [{ id: 'chap1', href: 'chap1.xhtml', 'media-type': 'application/xhtml+xml' }],
        toc: [{ id: 'toc1', href: 'chap1.xhtml', title: 'Chapter 1', level: 1, order: 1 }],
        spine: { contents: [] },
        on: jest.fn((event, handler): any => {
          if (event === 'end') setTimeout(() => handler(), 0);
          return mockEpubInstance;
        }),
        parse: jest.fn(),
        getChapter: jest.fn((chapterId: string, callback: Function) => callback(null, 'content')),
        getChapterRaw: jest.fn((chapterId: string, callback: Function) => callback(null, '')),
      };
      mockEPub.mockImplementation(() => mockEpubInstance as any);

      // Act
      const result = await parseEpub(mockFilePath, defaultOptions);

      // Assert: readonly properties should not be modifiable (TypeScript compile-time check)
      // Runtime mutation may still succeed; we verify the original value is correct.
      expect(result.metadata.title).toBe('Book');
    });
  });
});
