/**
 * Unit tests for ebook/search tool.
 * 
 * Follows AAA (Arrange‑Act‑Assert) pattern and tests:
 * - Successful search with matches across chapters
 * - Case‑insensitive search by default
 * - Case‑sensitive search when requested
 * - Limit parameter limits number of returned results
 * - Returns empty results when no matches found
 * - Returns chapter and page number for each match
 * - Surrounding context is included
 * - Error handling for session not found
 */

import { handleSearch, createSearchTool } from '../../../src/tools/search';
import { BookManager } from '../../../src/server/book-manager';
import { SessionNotFoundError } from '../../../src/server/book-manager';
import { SearchInput, SearchOutput } from '../../../src/server/types';
import { BookSession } from '../../../src/server/types';
import { Chapter } from '../../../src/epub/types';
import { BookMetadata } from '../../../src/epub/types';

describe('ebook/search tool', () => {
  let mockBookManager: jest.Mocked<BookManager>;
  const mockSessionId = 'session-123';
  
  // Helper to create a mock book session
  function createMockSession(): BookSession {
    const metadata: BookMetadata = {
      title: 'Sample Book',
      author: 'Author Name',
      publisher: 'Test Publisher',
      isbn: '1234567890',
      language: 'en',
      totalPages: 10,
      totalChapters: 2,
    };
    
    return {
      sessionId: mockSessionId,
      bookId: 'book-456',
      filePath: '/path/to/book.epub',
      metadata,
      toc: [],
      currentPosition: { page: 1, chapterId: 'chapter1', progress: 0 },
      bookmarks: [],
      createdAt: new Date('2026-01-01T00:00:00Z'),
      lastAccessed: new Date('2026-01-01T00:00:00Z'),
    };
  }

  // Helper to create a paginated chapter with pages
  function createPaginatedChapter(
    id: string,
    title: string,
    startPage: number,
    pagesContent: string[]
  ): Chapter & { pages: string[] } {
    return {
      id,
      title,
      startPage,
      endPage: startPage + pagesContent.length - 1,
      wordCount: 0,
      content: '', // original HTML content (not used)
      pages: pagesContent,
    };
  }

  beforeEach(() => {
    // Create a mocked BookManager with jest
    mockBookManager = {
      openBook: jest.fn(),
      closeBook: jest.fn(),
      getBook: jest.fn(),
      listOpenBooks: jest.fn(),
      updateLastAccessed: jest.fn(),
      getPaginatedChapters: jest.fn(),
      updateSessionPosition: jest.fn(),
      getSessionsByBookId: jest.fn(),
      getBookByBookId: jest.fn(),
      generateBookId: jest.fn(),
      generateSessionId: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleSearch', () => {
    it('returns matches with page numbers and context', async () => {
      // Arrange
      const input: SearchInput = {
        sessionId: mockSessionId,
        query: 'fox',
      };
      const mockSession = createMockSession();
      const mockChapters = [
        createPaginatedChapter('chapter1', 'Chapter 1', 1, [
          '<p>The quick brown fox jumps over the lazy dog.</p>',
          '<p>Another page without the fox.</p>',
        ]),
        createPaginatedChapter('chapter2', 'Chapter 2', 3, [
          '<p>A fox in the woods.</p>',
        ]),
      ];
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

      // Act
      const result: SearchOutput = await handleSearch(input, mockBookManager);

      // Assert
      expect(mockBookManager.getBook).toHaveBeenCalledWith(mockSessionId);
      expect(mockBookManager.getPaginatedChapters).toHaveBeenCalledWith(mockSessionId);
      
      // Should find three matches: page 1, page 2 (chapter1), page 3 (chapter2)
      expect(result.totalMatches).toBe(3);
      expect(result.results).toHaveLength(3);
      
      // First match on page 1, chapter1
      expect(result.results[0].page).toBe(1);
      expect(result.results[0].chapterId).toBe('chapter1');
      expect(result.results[0].snippet).toBe('fox');
      expect(result.results[0].context).toContain('fox');
      
      // Second match on page 2, chapter1
      expect(result.results[1].page).toBe(2);
      expect(result.results[1].chapterId).toBe('chapter1');
      expect(result.results[1].snippet).toBe('fox');
      expect(result.results[1].context).toContain('fox');
      
      // Third match on page 3, chapter2
      expect(result.results[2].page).toBe(3);
      expect(result.results[2].chapterId).toBe('chapter2');
      expect(result.results[2].snippet).toBe('fox');
      expect(result.results[2].context).toContain('fox');
    });

    it('performs case‑insensitive search by default', async () => {
      // Arrange
      const input: SearchInput = {
        sessionId: mockSessionId,
        query: 'FOX',
      };
      const mockSession = createMockSession();
      const mockChapters = [
        createPaginatedChapter('chapter1', 'Chapter 1', 1, [
          '<p>The quick brown fox jumps over the lazy dog.</p>',
        ]),
      ];
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

      // Act
      const result: SearchOutput = await handleSearch(input, mockBookManager);

      // Assert
      expect(result.totalMatches).toBe(1);
      expect(result.results[0].chapterId).toBe('chapter1');
      expect(result.results[0].snippet).toBe('fox');
    });

    it('performs case‑sensitive search when caseSensitive=true', async () => {
      // Arrange
      const input: SearchInput = {
        sessionId: mockSessionId,
        query: 'FOX',
        caseSensitive: true,
      };
      const mockSession = createMockSession();
      const mockChapters = [
        createPaginatedChapter('chapter1', 'Chapter 1', 1, [
          '<p>The quick brown fox jumps over the lazy dog.</p>',
        ]),
      ];
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

      // Act
      const result: SearchOutput = await handleSearch(input, mockBookManager);

      // Assert
      expect(result.totalMatches).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('respects the limit parameter', async () => {
      // Arrange
      const input: SearchInput = {
        sessionId: mockSessionId,
        query: 'fox',
        limit: 1,
      };
      const mockSession = createMockSession();
      const mockChapters = [
        createPaginatedChapter('chapter1', 'Chapter 1', 1, [
          '<p>fox one</p>',
          '<p>fox two</p>',
          '<p>fox three</p>',
        ]),
      ];
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

      // Act
      const result: SearchOutput = await handleSearch(input, mockBookManager);

      // Assert
      expect(result.totalMatches).toBe(3); // total matches across all pages
      expect(result.results).toHaveLength(1); // limited to 1 result
      expect(result.results[0].page).toBe(1);
      expect(result.results[0].chapterId).toBe('chapter1');
    });

    it('returns empty results when no matches found', async () => {
      // Arrange
      const input: SearchInput = {
        sessionId: mockSessionId,
        query: 'nonexistent',
      };
      const mockSession = createMockSession();
      const mockChapters = [
        createPaginatedChapter('chapter1', 'Chapter 1', 1, [
          '<p>Some content here.</p>',
        ]),
      ];
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

      // Act
      const result: SearchOutput = await handleSearch(input, mockBookManager);

      // Assert
      expect(result.totalMatches).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('throws SessionNotFoundError when session does not exist', async () => {
      // Arrange
      const input: SearchInput = {
        sessionId: 'invalid-session',
        query: 'something',
      };
      mockBookManager.getBook.mockReturnValue(null);

      // Act & Assert
      await expect(handleSearch(input, mockBookManager))
        .rejects.toThrow(SessionNotFoundError);
      expect(mockBookManager.getBook).toHaveBeenCalledWith('invalid-session');
      expect(mockBookManager.getPaginatedChapters).not.toHaveBeenCalled();
    });

    it('returns empty results when paginated chapters are unavailable', async () => {
      // Arrange
      const input: SearchInput = {
        sessionId: mockSessionId,
        query: 'fox',
      };
      const mockSession = createMockSession();
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(null);

      // Act
      const result: SearchOutput = await handleSearch(input, mockBookManager);

      // Assert
      expect(result.totalMatches).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('handles overlapping matches correctly', async () => {
      // Arrange
      const input: SearchInput = {
        sessionId: mockSessionId,
        query: 'aa',
      };
      const mockSession = createMockSession();
      const mockChapters = [
        createPaginatedChapter('chapter1', 'Chapter 1', 1, [
          '<p>aaa</p>', // contains 'aa' at positions 0 and 1
        ]),
      ];
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

      // Act
      const result: SearchOutput = await handleSearch(input, mockBookManager);

      // Assert
      expect(result.totalMatches).toBe(2); // two overlapping matches
      expect(result.results).toHaveLength(2);
      // Ensure snippets are 'aa' and chapterId is chapter1
      expect(result.results[0].chapterId).toBe('chapter1');
      expect(result.results[0].snippet).toBe('aa');
      expect(result.results[1].chapterId).toBe('chapter1');
      expect(result.results[1].snippet).toBe('aa');
    });

    it('captures surrounding context (50 characters by default)', async () => {
      // Arrange
      const longText = 'A very long sentence that contains the word fox somewhere in the middle of the text.';
      const input: SearchInput = {
        sessionId: mockSessionId,
        query: 'fox',
      };
      const mockSession = createMockSession();
      const mockChapters = [
        createPaginatedChapter('chapter1', 'Chapter 1', 1, [
          `<p>${longText}</p>`,
        ]),
      ];
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

      // Act
      const result: SearchOutput = await handleSearch(input, mockBookManager);

      // Assert
      expect(result.totalMatches).toBe(1);
      expect(result.results[0].chapterId).toBe('chapter1');
      const context = result.results[0].context!;
      expect(context).toContain('fox');
      // Context should be substring of stripped text (no HTML tags)
      expect(context.length).toBeLessThanOrEqual(50 + 'fox'.length + 50);
    });
  });

  describe('createSearchTool', () => {
    it('creates a tool object with correct name and handler', () => {
      // Arrange
      const tool = createSearchTool(mockBookManager);
      
      // Assert
      expect(tool.name).toBe('ebook/search');
      expect(typeof tool.handler).toBe('function');
    });

    it('tool handler calls handleSearch with typed input', async () => {
      // Arrange
      const tool = createSearchTool(mockBookManager);
      const input: SearchInput = {
        sessionId: mockSessionId,
        query: 'test',
      };
      const mockSession = createMockSession();
      const mockChapters = [
        createPaginatedChapter('chapter1', 'Chapter 1', 1, [
          '<p>test content</p>',
        ]),
      ];
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

      // Act
      const result = await tool.handler(input);

      // Assert
      expect(mockBookManager.getBook).toHaveBeenCalledWith(mockSessionId);
      expect(result.totalMatches).toBe(1);
    });

    it('tool handler passes through errors', async () => {
      // Arrange
      const tool = createSearchTool(mockBookManager);
      const input: SearchInput = {
        sessionId: 'invalid',
        query: 'test',
      };
      mockBookManager.getBook.mockReturnValue(null);

      // Act & Assert
      await expect(tool.handler(input)).rejects.toThrow(SessionNotFoundError);
    });
  });
});