/**
 * Unit tests for ebook/get_toc tool.
 * 
 * Follows AAA (Arrange‑Act‑Assert) pattern and tests:
 * - Successful TOC retrieval with valid session ID
 * - Returns hierarchical table of contents with correct fields
 * - Each entry includes title, chapter index, nesting level, href, and optional page
 * - Handles various TOC structures: flat, deep hierarchy, mixed
 * - Error handling for session not found
 * - Dependency injection via createGetTocTool factory
 */

import { handleGetToc, createGetTocTool } from '../../../src/tools/toc';
import { BookManager } from '../../../src/server/book-manager';
import { GetTocInput, GetTocOutput } from '../../../src/server/types';
import { SessionNotFoundError } from '../../../src/server/book-manager';
import { BookSession } from '../../../src/server/types';
import { BookMetadata, TOCEntry } from '../../../src/epub/types';

describe('ebook/get_toc tool', () => {
  let mockBookManager: jest.Mocked<BookManager>;
  const mockSessionId = 'session-123';

  // Helper to create a consistent mock book session with configurable TOC
  function createMockSession(
    sessionId: string,
    bookId: string,
    toc: TOCEntry[]
  ): BookSession {
    const metadata: BookMetadata = {
      title: 'Sample Book',
      author: 'Author Name',
      publisher: 'Test Publisher',
      isbn: '1234567890',
      language: 'en',
      totalPages: 100,
      totalChapters: toc.length,
    };
    
    return {
      sessionId,
      bookId,
      filePath: '/path/to/book.epub',
      metadata,
      toc,
      currentPosition: { 
        page: 1, 
        chapterId: toc[0]?.id, 
        progress: 0.01 
      },
      bookmarks: [],
      createdAt: new Date('2026-01-01T00:00:00Z'),
      lastAccessed: new Date('2026-01-01T00:00:00Z'),
    };
  }

  // Helper to create a flat TOC (no children)
  function createFlatToc(): TOCEntry[] {
    return [
      { id: 'toc1', title: 'Chapter 1', level: 1, href: 'chap1.xhtml', page: 1 },
      { id: 'toc2', title: 'Chapter 2', level: 1, href: 'chap2.xhtml', page: 10 },
      { id: 'toc3', title: 'Chapter 3', level: 1, href: 'chap3.xhtml', page: 20 },
      { id: 'toc4', title: 'Appendix A', level: 1, href: 'appa.xhtml', page: 90 },
    ];
  }

  // Helper to create a deep hierarchical TOC
  function createDeepHierarchyToc(): TOCEntry[] {
    return [
      {
        id: 'part1',
        title: 'Part I: Foundations',
        level: 1,
        href: 'part1.xhtml',
        page: 1,
        children: [
          {
            id: 'chap1',
            title: 'Chapter 1: Introduction',
            level: 2,
            href: 'chap1.xhtml',
            page: 2,
            children: [
              { id: 'sec1.1', title: 'Section 1.1', level: 3, href: 'sec1.1.xhtml', page: 3 },
              { id: 'sec1.2', title: 'Section 1.2', level: 3, href: 'sec1.2.xhtml', page: 5 },
            ],
          },
          { id: 'chap2', title: 'Chapter 2: Basics', level: 2, href: 'chap2.xhtml', page: 10 },
        ],
      },
      {
        id: 'part2',
        title: 'Part II: Applications',
        level: 1,
        href: 'part2.xhtml',
        page: 30,
        children: [
          { id: 'chap3', title: 'Chapter 3: Advanced', level: 2, href: 'chap3.xhtml', page: 31 },
        ],
      },
    ];
  }

  // Helper to create mixed TOC (some entries with children, some flat)
  function createMixedToc(): TOCEntry[] {
    return [
      { id: 'preface', title: 'Preface', level: 1, href: 'preface.xhtml', page: 1 },
      {
        id: 'part1',
        title: 'Part I',
        level: 1,
        href: 'part1.xhtml',
        page: 5,
        children: [
          { id: 'chap1', title: 'Chapter 1', level: 2, href: 'chap1.xhtml', page: 6 },
          { id: 'chap2', title: 'Chapter 2', level: 2, href: 'chap2.xhtml', page: 15 },
        ],
      },
      { id: 'appendix', title: 'Appendix', level: 1, href: 'appendix.xhtml', page: 80 },
    ];
  }

  beforeEach(() => {
    // Create a mocked BookManager with jest
    mockBookManager = {
      openBook: jest.fn(),
      closeBook: jest.fn(),
      getBook: jest.fn(),
      listOpenBooks: jest.fn(),
      updateLastAccessed: jest.fn(),
      getSessionsByBookId: jest.fn(),
      getBookByBookId: jest.fn(),
      generateBookId: jest.fn(),
      generateSessionId: jest.fn(),
      getPaginatedChapters: jest.fn(),
      updateSessionPosition: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleGetToc', () => {
    it('returns flat TOC when session has flat table of contents', async () => {
      // Arrange
      const flatToc = createFlatToc();
      const input: GetTocInput = { sessionId: mockSessionId };
      const mockSession = createMockSession(mockSessionId, 'book-456', flatToc);
      mockBookManager.getBook.mockReturnValue(mockSession);

      // Act
      const result: GetTocOutput = await handleGetToc(input, mockBookManager);

      // Assert
      expect(mockBookManager.getBook).toHaveBeenCalledTimes(1);
      expect(mockBookManager.getBook).toHaveBeenCalledWith(mockSessionId);
      expect(result.toc).toEqual(flatToc);
      expect(result.toc).toHaveLength(4);
      // Verify each entry has required fields
      result.toc.forEach(entry => {
        expect(entry.id).toBeDefined();
        expect(entry.title).toBeDefined();
        expect(entry.level).toBe(1);
        expect(entry.href).toBeDefined();
        expect(entry.page).toBeDefined();
        expect(entry.children).toBeUndefined();
      });
    });

    it('returns deep hierarchical TOC when session has nested structure', async () => {
      // Arrange
      const deepToc = createDeepHierarchyToc();
      const input: GetTocInput = { sessionId: mockSessionId };
      const mockSession = createMockSession(mockSessionId, 'book-456', deepToc);
      mockBookManager.getBook.mockReturnValue(mockSession);

      // Act
      const result = await handleGetToc(input, mockBookManager);

      // Assert
      expect(mockBookManager.getBook).toHaveBeenCalledWith(mockSessionId);
      expect(result.toc).toEqual(deepToc);
      // Verify hierarchy preserved
      expect(result.toc[0].children).toHaveLength(2);
      expect(result.toc[0].children![0].children).toHaveLength(2);
      expect(result.toc[0].children![0].children![0].level).toBe(3);
      // Ensure each entry has correct nesting level
      const traverse = (entries: TOCEntry[], expectedLevel: number) => {
        entries.forEach(entry => {
          expect(entry.level).toBe(expectedLevel);
          if (entry.children) traverse(entry.children, expectedLevel + 1);
        });
      };
      traverse(result.toc, 1);
    });

    it('returns mixed TOC when session has combination of flat and nested entries', async () => {
      // Arrange
      const mixedToc = createMixedToc();
      const input: GetTocInput = { sessionId: mockSessionId };
      const mockSession = createMockSession(mockSessionId, 'book-456', mixedToc);
      mockBookManager.getBook.mockReturnValue(mockSession);

      // Act
      const result = await handleGetToc(input, mockBookManager);

      // Assert
      expect(mockBookManager.getBook).toHaveBeenCalledWith(mockSessionId);
      expect(result.toc).toEqual(mixedToc);
      expect(result.toc).toHaveLength(3);
      expect(result.toc[0].children).toBeUndefined();
      expect(result.toc[1].children).toHaveLength(2);
      expect(result.toc[2].children).toBeUndefined();
    });

    it('returns empty TOC when session has no table of contents', async () => {
      // Arrange
      const emptyToc: TOCEntry[] = [];
      const input: GetTocInput = { sessionId: mockSessionId };
      const mockSession = createMockSession(mockSessionId, 'book-456', emptyToc);
      mockBookManager.getBook.mockReturnValue(mockSession);

      // Act
      const result = await handleGetToc(input, mockBookManager);

      // Assert
      expect(mockBookManager.getBook).toHaveBeenCalledWith(mockSessionId);
      expect(result.toc).toEqual([]);
      expect(result.toc).toHaveLength(0);
    });

    it('throws SessionNotFoundError when session does not exist', async () => {
      // Arrange
      const input: GetTocInput = { sessionId: 'nonexistent' };
      mockBookManager.getBook.mockReturnValue(null);

      // Act & Assert
      await expect(handleGetToc(input, mockBookManager))
        .rejects.toThrow(SessionNotFoundError);
      
      expect(mockBookManager.getBook).toHaveBeenCalledWith('nonexistent');
    });

    it('throws validation error when sessionId is empty', async () => {
      // Arrange
      const input = { sessionId: '' } as any; // Invalid empty string
      mockBookManager.getBook.mockReturnValue(null);

      // Act & Assert
      await expect(handleGetToc(input, mockBookManager))
        .rejects.toThrow(/Invalid input/);
      
      expect(mockBookManager.getBook).not.toHaveBeenCalled();
    });

    it('throws validation error when sessionId is missing', async () => {
      // Arrange
      const input = {} as any; // Missing sessionId
      mockBookManager.getBook.mockReturnValue(null);

      // Act & Assert
      await expect(handleGetToc(input, mockBookManager))
        .rejects.toThrow(/Invalid input/);
      
      expect(mockBookManager.getBook).not.toHaveBeenCalled();
    });
  });

  describe('createGetTocTool', () => {
    it('creates a tool object with correct name and handler', () => {
      // Arrange
      const tool = createGetTocTool(mockBookManager);

      // Assert
      expect(tool.name).toBe('ebook/get_toc');
      expect(typeof tool.handler).toBe('function');
    });

    it('tool handler calls handleGetToc with typed input', async () => {
      // Arrange
      const tool = createGetTocTool(mockBookManager);
      const input: GetTocInput = { sessionId: mockSessionId };
      const flatToc = createFlatToc();
      const mockSession = createMockSession(mockSessionId, 'book-456', flatToc);
      mockBookManager.getBook.mockReturnValue(mockSession);

      // Act
      const result = await tool.handler(input);

      // Assert
      expect(mockBookManager.getBook).toHaveBeenCalledWith(mockSessionId);
      expect(result.toc).toEqual(flatToc);
    });

    it('tool handler passes through errors', async () => {
      // Arrange
      const tool = createGetTocTool(mockBookManager);
      const input: GetTocInput = { sessionId: 'nonexistent' };
      mockBookManager.getBook.mockReturnValue(null);

      // Act & Assert
      await expect(tool.handler(input)).rejects.toThrow(SessionNotFoundError);
    });
  });
});