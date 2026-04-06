/**
 * Integration tests for MCP EPUB Reader server.
 *
 * Verifies standard MCP handlers, centralized tool registration, and protocol errors.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  PingRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { BookManagerImpl } from '../../src/server/book-manager';
import { createServer, startServer } from '../../src/server/index';

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    connect: jest.fn(),
    close: jest.fn(),
  })),
}));

jest.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  const actual = jest.requireActual('@modelcontextprotocol/sdk/server/index.js');

  return {
    ...actual,
    Server: jest.fn().mockImplementation((...args) => {
      const instance = new actual.Server(...args);
      jest.spyOn(instance, 'setRequestHandler');
      jest.spyOn(instance, 'connect');
      jest.spyOn(instance, 'close');
      return instance;
    }),
  };
});

describe('MCP Server Integration', () => {
  const getHandler = (server: Server, schema: unknown) => {
    const call = (server.setRequestHandler as jest.Mock).mock.calls.find(
      ([registeredSchema]) => registeredSchema === schema,
    );

    if (!call) {
      throw new Error('Handler not registered');
    }

    return call[1] as (request: unknown) => Promise<unknown>;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers standard MCP handlers', () => {
    const server = createServer({ bookManager: new BookManagerImpl() });

    expect(Server).toHaveBeenCalledWith(
      { name: 'epub-reader', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    expect(server.setRequestHandler).toHaveBeenCalledWith(ListToolsRequestSchema, expect.any(Function));
    expect(server.setRequestHandler).toHaveBeenCalledWith(PingRequestSchema, expect.any(Function));
    expect(server.setRequestHandler).toHaveBeenCalledWith(CallToolRequestSchema, expect.any(Function));
  });

  it('returns centralized tool metadata from tools/list', async () => {
    const server = createServer({ bookManager: new BookManagerImpl() });
    const handler = getHandler(server, ListToolsRequestSchema);

    const result = await handler({});

    expect(result).toHaveProperty('tools');
    expect((result as { tools: Array<{ name: string }> }).tools).toHaveLength(13);
    expect((result as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name)).toEqual([
      'ebook/open',
      'ebook/close',
      'ebook/list_open_books',
      'ebook/navigate_next',
      'ebook/navigate_previous',
      'ebook/jump_to_page',
      'ebook/jump_to_chapter',
      'ebook/get_position',
      'ebook/search',
      'ebook/get_toc',
      'ebook/get_metadata',
      'ebook/get_footnote',
      'ebook/get_chapter_summary',
    ]);
  });

  it('responds to ping requests', async () => {
    const server = createServer({ bookManager: new BookManagerImpl() });
    const handler = getHandler(server, PingRequestSchema);

    await expect(handler({})).resolves.toEqual({});
  });

  it('throws a protocol error for unknown tools', async () => {
    const server = createServer({ bookManager: new BookManagerImpl() });
    const handler = getHandler(server, CallToolRequestSchema);
    const request = handler({
      params: {
        name: 'unknown/tool',
        arguments: {},
      },
    });

    await expect(request).rejects.toHaveProperty('code', ErrorCode.MethodNotFound);
    await expect(request).rejects.toThrow('Unknown tool: unknown/tool');
  });

  it('throws a protocol error for invalid input', async () => {
    const server = createServer({ bookManager: new BookManagerImpl() });
    const handler = getHandler(server, CallToolRequestSchema);
    const request = handler({
      params: {
        name: 'ebook/open',
        arguments: {},
      },
    });

    await expect(request).rejects.toHaveProperty('code', ErrorCode.InvalidParams);
    await expect(request).rejects.toThrow('Invalid input');
  });

  it('returns MCP tool results for successful calls', async () => {
    const server = createServer({ bookManager: new BookManagerImpl() });
    const handler = getHandler(server, CallToolRequestSchema);

    const result = await handler({
      params: {
        name: 'ebook/list_open_books',
        arguments: {},
      },
    });

    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('structuredContent');
    expect(result).not.toHaveProperty('error');
    expect(result).toMatchObject({
      structuredContent: { sessions: [] },
      content: [
        {
          type: 'text',
          text: JSON.stringify({ sessions: [] }),
        },
      ],
    });
  });

  it('exports startServer', () => {
    expect(typeof startServer).toBe('function');
  });

  it('creates a server that can receive initialized callbacks', () => {
    const onInitialized = jest.fn();
    const server = createServer({
      bookManager: new BookManagerImpl(),
      onInitialized,
    });

    expect((server as { oninitialized?: unknown }).oninitialized).toBe(onInitialized);
  });
});
