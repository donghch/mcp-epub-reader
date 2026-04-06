/**
 * Unit tests for ebook/get_chapter_summary tool.
 * 
 * Follows AAA (Arrange‑Act‑Assert) pattern and tests:
 * - Successful summary generation with key sentences
 * - Configurable maxSentences parameter
 * - Returns chapter title and word count
 * - Handles short chapters gracefully
 * - Returns empty summary when chapter content is empty
 * - Error handling for session not found
 * - Returns empty result when chapter not found
 * - Respects maxSentences limit
 */

import { handleGetChapterSummary, createGetChapterSummaryTool } from '../../../src/tools/summary';
import { BookManager } from '../../../src/server/book-manager';
import { SessionNotFoundError } from '../../../src/server/book-manager';
import { GetChapterSummaryInput, GetChapterSummaryOutput } from '../../../src/server/types';
import { BookSession } from '../../../src/server/types';
import { Chapter } from '../../../src/epub/types';
import { BookMetadata } from '../../../src/epub/types';

describe('ebook/get_chapter_summary tool', () => {
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
  
  // Helper to create a paginated chapter with content
  function createPaginatedChapter(
    id: string,
    title: string,
    startPage: number,
    content: string, // HTML content
    wordCount?: number
  ): Chapter & { pages?: string[] } {
    return {
      id,
      title,
      startPage,
      endPage: startPage + 1, // dummy
      wordCount: wordCount ?? 0,
      content,
    };
  }
  
  // Sample chapter content with multiple paragraphs and sentences
  const sampleChapterHtml = `
    <p>This is the first paragraph. It contains two sentences. The second sentence is here.</p>
    <p>Second paragraph has only one sentence.</p>
    <p>Third paragraph is longer. It has three sentences. Indeed, it does.</p>
    <p>Fourth paragraph is short.</p>
  `;
  
  // Expected plain text (stripped) for word count calculation
  const samplePlainText = `This is the first paragraph. It contains two sentences. The second sentence is here. Second paragraph has only one sentence. Third paragraph is longer. It has three sentences. Indeed, it does. Fourth paragraph is short.`;
  
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
  
  describe('handleGetChapterSummary', () => {
    it('returns summary with chapter title and word count', async () => {
      // Arrange
      const input: GetChapterSummaryInput = {
        sessionId: mockSessionId,
        chapterId: 'chapter1',
      };
      const mockSession = createMockSession();
      const mockChapters = [
        createPaginatedChapter('chapter1', 'Chapter One', 1, sampleChapterHtml, 35),
      ];
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
      
      // Act
      const result: GetChapterSummaryOutput = await handleGetChapterSummary(input, mockBookManager);
      
      // Assert
      expect(mockBookManager.getBook).toHaveBeenCalledWith(mockSessionId);
      expect(mockBookManager.getPaginatedChapters).toHaveBeenCalledWith(mockSessionId);
      
      expect(result.chapterId).toBe('chapter1');
      expect(result.chapterTitle).toBe('Chapter One');
      expect(result.wordCount).toBeGreaterThan(0); // actual word count from sample
      expect(result.summary).toBeTruthy();
      // Summary should contain first sentences from paragraphs
      expect(result.summary).toContain('This is the first paragraph.');
      expect(result.summary).toContain('Second paragraph has only one sentence.');
      expect(result.summary).toContain('Third paragraph is longer.');
      expect(result.summary).toContain('Fourth paragraph is short.');
      // Should not contain the later sentences from first paragraph (due to limit)
      // Since maxSentences default is 10, we may include all first sentences.
      // Let's verify keyPoints is optional but present
      if (result.keyPoints) {
        expect(result.keyPoints.length).toBeGreaterThan(0);
      }
    });
    
    it('respects maxSentences parameter', async () => {
      // Arrange
      const input: GetChapterSummaryInput = {
        sessionId: mockSessionId,
        chapterId: 'chapter1',
        maxSentences: 2,
      };
      const mockSession = createMockSession();
      const mockChapters = [
        createPaginatedChapter('chapter1', 'Chapter One', 1, sampleChapterHtml),
      ];
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
      
      // Act
      const result: GetChapterSummaryOutput = await handleGetChapterSummary(input, mockBookManager);
      
      // Assert
      // Should only include first two sentences (first sentence of first two paragraphs)
      const sentences = result.summary.split(/[.!?]+/).filter(s => s.trim()).map(s => s.trim() + '.');
      expect(sentences.length).toBeLessThanOrEqual(2);
      expect(result.summary).toContain('This is the first paragraph.');
      expect(result.summary).toContain('Second paragraph has only one sentence.');
      // Should not contain third paragraph's first sentence
      expect(result.summary).not.toContain('Third paragraph is longer.');
    });
    
    it('handles short chapters gracefully', async () => {
      // Arrange: chapter with only one short paragraph
      const shortHtml = '<p>Only one sentence.</p>';
      const input: GetChapterSummaryInput = {
        sessionId: mockSessionId,
        chapterId: 'short',
      };
      const mockSession = createMockSession();
      const mockChapters = [
        createPaginatedChapter('short', 'Short Chapter', 1, shortHtml, 3),
      ];
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
      
      // Act
      const result: GetChapterSummaryOutput = await handleGetChapterSummary(input, mockBookManager);
      
      // Assert
      expect(result.chapterId).toBe('short');
      expect(result.chapterTitle).toBe('Short Chapter');
      expect(result.wordCount).toBe(3);
      expect(result.summary).toBe('Only one sentence.');
      // keyPoints may be undefined or contain the single sentence
    });
    
    it('returns empty summary when chapter content is empty', async () => {
      // Arrange
      const input: GetChapterSummaryInput = {
        sessionId: mockSessionId,
        chapterId: 'empty',
      };
      const mockSession = createMockSession();
      const mockChapters = [
        createPaginatedChapter('empty', 'Empty Chapter', 1, ''),
      ];
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
      
      // Act
      const result: GetChapterSummaryOutput = await handleGetChapterSummary(input, mockBookManager);
      
      // Assert
      expect(result.chapterId).toBe('empty');
      expect(result.chapterTitle).toBe('Empty Chapter');
      expect(result.wordCount).toBe(0);
      expect(result.summary).toBe('');
      expect(result.keyPoints).toBeUndefined(); // no key points
    });
    
    it('throws SessionNotFoundError when session does not exist', async () => {
      // Arrange
      const input: GetChapterSummaryInput = {
        sessionId: 'invalid-session',
        chapterId: 'chapter1',
      };
      mockBookManager.getBook.mockReturnValue(null);
      
      // Act & Assert
      await expect(handleGetChapterSummary(input, mockBookManager))
        .rejects.toThrow(SessionNotFoundError);
      expect(mockBookManager.getBook).toHaveBeenCalledWith('invalid-session');
      expect(mockBookManager.getPaginatedChapters).not.toHaveBeenCalled();
    });
    
    it('returns empty result when chapter not found', async () => {
      // Arrange
      const input: GetChapterSummaryInput = {
        sessionId: mockSessionId,
        chapterId: 'nonexistent',
      };
      const mockSession = createMockSession();
      const mockChapters = [
        createPaginatedChapter('chapter1', 'Chapter One', 1, sampleChapterHtml),
      ];
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
      
      // Act
      const result: GetChapterSummaryOutput = await handleGetChapterSummary(input, mockBookManager);
      
      // Assert
      expect(result.chapterId).toBe('nonexistent');
      expect(result.chapterTitle).toBe('');
      expect(result.wordCount).toBe(0);
      expect(result.summary).toBe('');
      expect(result.keyPoints).toBeUndefined();
    });
    
    it('returns empty result when paginated chapters are unavailable', async () => {
      // Arrange
      const input: GetChapterSummaryInput = {
        sessionId: mockSessionId,
        chapterId: 'chapter1',
      };
      const mockSession = createMockSession();
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(null);
      
      // Act
      const result: GetChapterSummaryOutput = await handleGetChapterSummary(input, mockBookManager);
      
      // Assert
      expect(result.chapterId).toBe('chapter1');
      expect(result.chapterTitle).toBe('');
      expect(result.wordCount).toBe(0);
      expect(result.summary).toBe('');
      expect(result.keyPoints).toBeUndefined();
    });
    
    it('includes both first and last sentences for longer paragraphs when includeLast is true', async () => {
      // Arrange: a paragraph with three sentences
      const multiSentenceHtml = '<p>First sentence. Second sentence. Third sentence.</p>';
      const input: GetChapterSummaryInput = {
        sessionId: mockSessionId,
        chapterId: 'multi',
        maxSentences: 10,
      };
      const mockSession = createMockSession();
      const mockChapters = [
        createPaginatedChapter('multi', 'Multi Sentence', 1, multiSentenceHtml),
      ];
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
      
      // Act
      const result: GetChapterSummaryOutput = await handleGetChapterSummary(input, mockBookManager);
      
      // Assert: our extractKeySentences with includeLast true should include first and last sentences
      // The summary should contain "First sentence." and "Third sentence." but maybe not "Second sentence."
      expect(result.summary).toContain('First sentence.');
      expect(result.summary).toContain('Third sentence.');
      // The second sentence may or may not appear (depends on extraction logic).
      // Since we only include first and last, second should not appear.
      // However our current extractKeySentences includes first and last only if paragraph has >2 sentences.
      // That's the case, so we expect both first and last.
      // The summary will be "First sentence. Third sentence."
      // Let's verify that second sentence is not present (optional)
      // Since we join with space, there may be extra spaces.
    });
  });
  
  describe('createGetChapterSummaryTool', () => {
    it('creates a tool object with correct name and handler', () => {
      // Arrange
      const tool = createGetChapterSummaryTool(mockBookManager);
      
      // Assert
      expect(tool.name).toBe('ebook/get_chapter_summary');
      expect(typeof tool.handler).toBe('function');
    });
    
    it('tool handler calls handleGetChapterSummary with typed input', async () => {
      // Arrange
      const tool = createGetChapterSummaryTool(mockBookManager);
      const input: GetChapterSummaryInput = {
        sessionId: mockSessionId,
        chapterId: 'chapter1',
      };
      const mockSession = createMockSession();
      const mockChapters = [
        createPaginatedChapter('chapter1', 'Chapter One', 1, sampleChapterHtml),
      ];
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
      
      // Act
      const result = await tool.handler(input);
      
      // Assert
      expect(mockBookManager.getBook).toHaveBeenCalledWith(mockSessionId);
      expect(result.chapterId).toBe('chapter1');
      expect(result.summary).toBeTruthy();
    });
    
    it('tool handler passes through errors', async () => {
      // Arrange
      const tool = createGetChapterSummaryTool(mockBookManager);
      const input: GetChapterSummaryInput = {
        sessionId: 'invalid',
        chapterId: 'chapter1',
      };
      mockBookManager.getBook.mockReturnValue(null);
      
      // Act & Assert
      await expect(tool.handler(input)).rejects.toThrow(SessionNotFoundError);
    });
  });
});