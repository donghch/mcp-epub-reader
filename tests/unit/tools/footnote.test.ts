/**
 * Unit tests for ebook/get_footnote tool.
 * 
 * Follows AAA (Arrange‑Act‑Assert) pattern and tests:
 * - Successful footnote retrieval by ID
 * - Error handling for non‑existent footnote
 * - Error handling for non‑existent session
 * - Edge cases (empty footnotes array, missing footnotes field)
 */

import { handleGetFootnote, createFootnoteTool, FootnoteNotFoundError } from '../../../src/tools/footnote';
import { BookManager } from '../../../src/server/book-manager';
import { GetFootnoteInput, GetFootnoteOutput } from '../../../src/server/types';
import { SessionNotFoundError } from '../../../src/server/book-manager';
import { BookSession } from '../../../src/server/types';
import { Footnote } from '../../../src/epub/types';

describe('ebook/get_footnote tool', () => {
  let mockBookManager: jest.Mocked<BookManager>;
  const mockSessionId = 'session-123';
  const mockFootnoteId = 'fn-1';
  const mockFootnoteContent = '<p>This is a footnote.</p>';
  
  // Helper to create a consistent mock book session with footnotes
  function createMockSession(footnotes: Footnote[] = []): BookSession {
    return {
      sessionId: mockSessionId,
      bookId: 'book-456',
      filePath: '/path/to/book.epub',
      metadata: {
        title: 'Sample Book',
        author: 'Author Name',
        publisher: 'Test Publisher',
        isbn: '1234567890',
        language: 'en',
        totalPages: 42,
        totalChapters: 7,
      },
      toc: [
        { id: 'toc1', title: 'Chapter 1', level: 1, href: 'chap1.xhtml' },
      ],
      currentPosition: { page: 1, chapterId: 'chapter1', progress: 0 },
      bookmarks: [],
      footnotes,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      lastAccessed: new Date('2026-01-01T00:00:00Z'),
    };
  }
  
  // Helper to create a mock footnote
  function createMockFootnote(id: string = mockFootnoteId, content: string = mockFootnoteContent): Footnote {
    return {
      id,
      content,
      page: 5,
      sourceChapter: 'chapter1',
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
      getSessionsByBookId: jest.fn(),
      getBookByBookId: jest.fn(),
      generateBookId: jest.fn(),
      generateSessionId: jest.fn(),
    } as any;
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('handleGetFootnote', () => {
    it('successfully returns a footnote by ID', async () => {
      // Arrange
      const input: GetFootnoteInput = { sessionId: mockSessionId, footnoteId: mockFootnoteId };
      const mockFootnote = createMockFootnote();
      const mockSession = createMockSession([mockFootnote]);
      mockBookManager.getBook.mockReturnValue(mockSession);
      
      // Act
      const result: GetFootnoteOutput = await handleGetFootnote(input, mockBookManager);
      
      // Assert
      expect(mockBookManager.getBook).toHaveBeenCalledTimes(1);
      expect(mockBookManager.getBook).toHaveBeenCalledWith(mockSessionId);
      
      expect(result.id).toBe(mockFootnoteId);
      expect(result.content).toBe(mockFootnoteContent);
      expect(result.page).toBe(5);
      expect(result.sourceChapter).toBe('chapter1');
    });
    
    it('throws SessionNotFoundError when session does not exist', async () => {
      // Arrange
      const input: GetFootnoteInput = { sessionId: 'non-existent', footnoteId: mockFootnoteId };
      mockBookManager.getBook.mockReturnValue(null);
      
      // Act & Assert
      await expect(handleGetFootnote(input, mockBookManager))
        .rejects.toThrow(SessionNotFoundError);
      
      expect(mockBookManager.getBook).toHaveBeenCalledWith('non-existent');
    });
    
    it('throws FootnoteNotFoundError when footnote ID is not found', async () => {
      // Arrange
      const input: GetFootnoteInput = { sessionId: mockSessionId, footnoteId: 'non-existent' };
      const mockFootnote = createMockFootnote();
      const mockSession = createMockSession([mockFootnote]);
      mockBookManager.getBook.mockReturnValue(mockSession);
      
      // Act & Assert
      await expect(handleGetFootnote(input, mockBookManager))
        .rejects.toThrow(FootnoteNotFoundError);
      
      expect(mockBookManager.getBook).toHaveBeenCalledWith(mockSessionId);
    });
    
    it('handles empty footnotes array gracefully', async () => {
      // Arrange
      const input: GetFootnoteInput = { sessionId: mockSessionId, footnoteId: mockFootnoteId };
      const mockSession = createMockSession([]); // empty footnotes
      mockBookManager.getBook.mockReturnValue(mockSession);
      
      // Act & Assert
      await expect(handleGetFootnote(input, mockBookManager))
        .rejects.toThrow(FootnoteNotFoundError);
    });
    
    it('handles missing footnotes field (undefined) gracefully', async () => {
      // Arrange
      const input: GetFootnoteInput = { sessionId: mockSessionId, footnoteId: mockFootnoteId };
      const mockSession = createMockSession();
      // Remove footnotes field (simulate session opened before footnotes were added)
      delete (mockSession as any).footnotes;
      mockBookManager.getBook.mockReturnValue(mockSession);
      
      // Act & Assert
      await expect(handleGetFootnote(input, mockBookManager))
        .rejects.toThrow(FootnoteNotFoundError);
    });
    
    it('returns the correct footnote when multiple footnotes exist', async () => {
      // Arrange
      const footnotes = [
        createMockFootnote('fn-1', 'First footnote'),
        createMockFootnote('fn-2', 'Second footnote'),
        createMockFootnote('fn-3', 'Third footnote'),
      ];
      const input: GetFootnoteInput = { sessionId: mockSessionId, footnoteId: 'fn-2' };
      const mockSession = createMockSession(footnotes);
      mockBookManager.getBook.mockReturnValue(mockSession);
      
      // Act
      const result = await handleGetFootnote(input, mockBookManager);
      
      // Assert
      expect(result.id).toBe('fn-2');
      expect(result.content).toBe('Second footnote');
    });
    
    it('handles footnotes with no sourceChapter', async () => {
      // Arrange
      const footnote: Footnote = {
        id: 'fn-no-chapter',
        content: 'Footnote without chapter',
        page: 10,
        // sourceChapter omitted
      };
      const input: GetFootnoteInput = { sessionId: mockSessionId, footnoteId: 'fn-no-chapter' };
      const mockSession = createMockSession([footnote]);
      mockBookManager.getBook.mockReturnValue(mockSession);
      
      // Act
      const result = await handleGetFootnote(input, mockBookManager);
      
      // Assert
      expect(result.id).toBe('fn-no-chapter');
      expect(result.content).toBe('Footnote without chapter');
      expect(result.page).toBe(10);
      expect(result.sourceChapter).toBeUndefined();
    });
  });
  
  describe('createFootnoteTool', () => {
    it('creates a tool object with correct name and handler', () => {
      // Arrange
      const tool = createFootnoteTool(mockBookManager);
      
      // Assert
      expect(tool.name).toBe('ebook/get_footnote');
      expect(typeof tool.handler).toBe('function');
    });
    
    it('tool handler calls handleGetFootnote with typed input', async () => {
      // Arrange
      const tool = createFootnoteTool(mockBookManager);
      const input: GetFootnoteInput = { sessionId: mockSessionId, footnoteId: mockFootnoteId };
      const mockFootnote = createMockFootnote();
      const mockSession = createMockSession([mockFootnote]);
      mockBookManager.getBook.mockReturnValue(mockSession);
      
      // Act
      const result = await tool.handler(input);
      
      // Assert
      expect(mockBookManager.getBook).toHaveBeenCalledWith(mockSessionId);
      expect(result.id).toBe(mockFootnoteId);
    });
    
    it('tool handler passes through errors', async () => {
      // Arrange
      const tool = createFootnoteTool(mockBookManager);
      const input: GetFootnoteInput = { sessionId: mockSessionId, footnoteId: 'non-existent' };
      const mockFootnote = createMockFootnote();
      const mockSession = createMockSession([mockFootnote]);
      mockBookManager.getBook.mockReturnValue(mockSession);
      
      // Act & Assert
      await expect(tool.handler(input)).rejects.toThrow(FootnoteNotFoundError);
    });
  });
});