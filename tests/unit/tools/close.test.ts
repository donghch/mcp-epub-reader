/**
 * Unit tests for ebook/close tool.
 * 
 * Follows AAA (Arrange‑Act‑Assert) pattern and tests:
 * - Successful session closure with valid sessionId
 * - Proper output format (closed: true, sessionId)
 * - Error handling for non‑existent sessionId
 * - Dependency injection via createCloseTool factory
 */

import { handleCloseBook, createCloseTool } from '../../../src/tools/close';
import { BookManager } from '../../../src/server/book-manager';
import { CloseBookInput, CloseBookOutput } from '../../../src/server/types';
import { SessionNotFoundError } from '../../../src/server/book-manager';

describe('ebook/close tool', () => {
  let mockBookManager: jest.Mocked<BookManager>;
  const mockSessionId = 'session-123';
  
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
  
  describe('handleCloseBook', () => {
    it('successfully closes a session and returns correct output', async () => {
      // Arrange
      const input: CloseBookInput = { sessionId: mockSessionId };
      mockBookManager.closeBook.mockReturnValue(true);
      
      // Act
      const result: CloseBookOutput = await handleCloseBook(input, mockBookManager);
      
      // Assert
      expect(mockBookManager.closeBook).toHaveBeenCalledTimes(1);
      expect(mockBookManager.closeBook).toHaveBeenCalledWith(mockSessionId);
      
      expect(result.closed).toBe(true);
      expect(result.sessionId).toBe(mockSessionId);
    });
    
    it('throws SessionNotFoundError when session does not exist', async () => {
      // Arrange
      const input: CloseBookInput = { sessionId: 'non-existent-session' };
      mockBookManager.closeBook.mockReturnValue(false);
      
      // Act & Assert
      await expect(handleCloseBook(input, mockBookManager))
        .rejects.toThrow(SessionNotFoundError);
      
      expect(mockBookManager.closeBook).toHaveBeenCalledWith('non-existent-session');
    });
    
    it('propagates unexpected errors from BookManager', async () => {
      // Arrange
      const input: CloseBookInput = { sessionId: mockSessionId };
      const error = new Error('Unexpected internal error');
      mockBookManager.closeBook.mockImplementation(() => {
        throw error;
      });
      
      // Act & Assert
      await expect(handleCloseBook(input, mockBookManager))
        .rejects.toThrow('Unexpected internal error');
    });
  });
  
  describe('createCloseTool', () => {
    it('creates a tool object with correct name and handler', () => {
      // Arrange
      const tool = createCloseTool(mockBookManager);
      
      // Assert
      expect(tool.name).toBe('ebook/close');
      expect(typeof tool.handler).toBe('function');
    });
    
    it('tool handler calls handleCloseBook with typed input', async () => {
      // Arrange
      const tool = createCloseTool(mockBookManager);
      const input: CloseBookInput = { sessionId: mockSessionId };
      mockBookManager.closeBook.mockReturnValue(true);
      
      // Act
      const result = await tool.handler(input);
      
      // Assert
      expect(mockBookManager.closeBook).toHaveBeenCalledWith(mockSessionId);
      expect(result.closed).toBe(true);
      expect(result.sessionId).toBe(mockSessionId);
    });
    
    it('tool handler passes through SessionNotFoundError', async () => {
      // Arrange
      const tool = createCloseTool(mockBookManager);
      const input: CloseBookInput = { sessionId: 'bad-id' };
      mockBookManager.closeBook.mockReturnValue(false);
      
      // Act & Assert
      await expect(tool.handler(input)).rejects.toThrow(SessionNotFoundError);
    });
  });
});