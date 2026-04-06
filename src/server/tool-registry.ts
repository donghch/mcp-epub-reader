import type { BookManager } from './book-manager';
import type { ToolName } from '../utils/validation';
import {
  createOpenTool,
} from '../tools/open';
import {
  createCloseTool,
} from '../tools/close';
import {
  createListOpenBooksTool,
} from '../tools/list-books';
import {
  createNavigateNextTool,
  createNavigatePreviousTool,
} from '../tools/navigate';
import {
  createJumpToPageTool,
  createJumpToChapterTool,
} from '../tools/jump';
import { createGetPositionTool } from '../tools/position';
import { createSearchTool } from '../tools/search';
import { createGetTocTool } from '../tools/toc';
import { createGetMetadataTool } from '../tools/metadata';
import { createFootnoteTool } from '../tools/footnote';
import { createGetChapterSummaryTool } from '../tools/summary';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

type JsonObjectSchema = {
  readonly type: 'object';
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
};

type ToolFactoryResult = {
  readonly name: ToolName;
  readonly handler: (input: unknown) => Promise<unknown>;
};

export interface ToolRegistryEntry {
  readonly name: ToolName;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: JsonObjectSchema;
  readonly execute: (input: unknown) => Promise<unknown>;
}

export interface ToolRegistry {
  readonly tools: readonly ToolRegistryEntry[];
  getTool(name: string): ToolRegistryEntry | undefined;
  listTools(): Array<Pick<ToolRegistryEntry, 'name' | 'title' | 'description' | 'inputSchema'>>;
}

type ToolBlueprint = {
  readonly name: ToolName;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: JsonObjectSchema;
  readonly createTool: (bookManager: BookManager) => ToolFactoryResult;
};

const objectSchema = (
  properties: JsonObjectSchema['properties'],
  required: readonly string[] = [],
): JsonObjectSchema => ({
  type: 'object',
  properties,
  ...(required.length > 0 ? { required } : {}),
});

const TOOL_BLUEPRINTS: readonly ToolBlueprint[] = [
  {
    name: 'ebook/open',
    title: 'Open EPUB',
    description: 'Open an EPUB file and create a reading session.',
    inputSchema: objectSchema({
      filePath: { type: 'string' },
      autoNavigate: { type: 'boolean' },
    }, ['filePath']),
    createTool: createOpenTool,
  },
  {
    name: 'ebook/close',
    title: 'Close EPUB',
    description: 'Close an open book session.',
    inputSchema: objectSchema({
      sessionId: { type: 'string' },
    }, ['sessionId']),
    createTool: createCloseTool,
  },
  {
    name: 'ebook/list_open_books',
    title: 'List Open Books',
    description: 'List currently open book sessions.',
    inputSchema: objectSchema({}),
    createTool: createListOpenBooksTool,
  },
  {
    name: 'ebook/navigate_next',
    title: 'Navigate Next',
    description: 'Advance the current reading position.',
    inputSchema: objectSchema({
      sessionId: { type: 'string' },
      steps: { type: 'integer', minimum: 1 },
    }, ['sessionId']),
    createTool: createNavigateNextTool,
  },
  {
    name: 'ebook/navigate_previous',
    title: 'Navigate Previous',
    description: 'Move the current reading position backward.',
    inputSchema: objectSchema({
      sessionId: { type: 'string' },
      steps: { type: 'integer', minimum: 1 },
    }, ['sessionId']),
    createTool: createNavigatePreviousTool,
  },
  {
    name: 'ebook/jump_to_page',
    title: 'Jump to Page',
    description: 'Jump to a specific page.',
    inputSchema: objectSchema({
      sessionId: { type: 'string' },
      page: { type: 'integer', minimum: 1 },
    }, ['sessionId', 'page']),
    createTool: createJumpToPageTool,
  },
  {
    name: 'ebook/jump_to_chapter',
    title: 'Jump to Chapter',
    description: 'Jump to a specific chapter.',
    inputSchema: objectSchema({
      sessionId: { type: 'string' },
      chapterId: { type: 'string' },
    }, ['sessionId', 'chapterId']),
    createTool: createJumpToChapterTool,
  },
  {
    name: 'ebook/get_position',
    title: 'Get Position',
    description: 'Get the current reading position.',
    inputSchema: objectSchema({
      sessionId: { type: 'string' },
    }, ['sessionId']),
    createTool: createGetPositionTool,
  },
  {
    name: 'ebook/search',
    title: 'Search Book',
    description: 'Search within the book.',
    inputSchema: objectSchema({
      sessionId: { type: 'string' },
      query: { type: 'string' },
      caseSensitive: { type: 'boolean' },
      limit: { type: 'integer', minimum: 0 },
      contextWindow: { type: 'integer', minimum: 0 },
    }, ['sessionId', 'query']),
    createTool: createSearchTool,
  },
  {
    name: 'ebook/get_toc',
    title: 'Get Table of Contents',
    description: 'Get the table of contents.',
    inputSchema: objectSchema({
      sessionId: { type: 'string' },
    }, ['sessionId']),
    createTool: createGetTocTool,
  },
  {
    name: 'ebook/get_metadata',
    title: 'Get Metadata',
    description: 'Get book metadata.',
    inputSchema: objectSchema({
      sessionId: { type: 'string' },
    }, ['sessionId']),
    createTool: createGetMetadataTool,
  },
  {
    name: 'ebook/get_footnote',
    title: 'Get Footnote',
    description: 'Get a footnote by ID.',
    inputSchema: objectSchema({
      sessionId: { type: 'string' },
      footnoteId: { type: 'string' },
    }, ['sessionId', 'footnoteId']),
    createTool: createFootnoteTool,
  },
  {
    name: 'ebook/get_chapter_summary',
    title: 'Get Chapter Summary',
    description: 'Get a summary of a chapter.',
    inputSchema: objectSchema({
      sessionId: { type: 'string' },
      chapterId: { type: 'string' },
      maxSentences: { type: 'integer', minimum: 0 },
    }, ['sessionId', 'chapterId']),
    createTool: createGetChapterSummaryTool,
  },
] as const;

function createRegistryEntry(blueprint: ToolBlueprint, bookManager: BookManager): ToolRegistryEntry {
  const tool = blueprint.createTool(bookManager);

  return {
    name: blueprint.name,
    title: blueprint.title,
    description: blueprint.description,
    inputSchema: blueprint.inputSchema,
    execute: tool.handler,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function serializeOutput(output: unknown): string {
  const serialized = JSON.stringify(output);
  return serialized ?? String(output);
}

export function createToolRegistry(bookManager: BookManager): ToolRegistry {
  const tools = TOOL_BLUEPRINTS.map((blueprint) => createRegistryEntry(blueprint, bookManager));
  const byName = new Map<ToolName, ToolRegistryEntry>(tools.map((tool) => [tool.name, tool]));

  return {
    tools,
    getTool: (name: string) => byName.get(name as ToolName),
    listTools: () => tools.map(({ name, title, description, inputSchema }) => ({
      name,
      title,
      description,
      inputSchema,
    })),
  };
}

export function formatToolResult(output: unknown): CallToolResult {
  const content = [{ type: 'text', text: serializeOutput(output) } as const];

  if (isRecord(output)) {
    return {
      content,
      structuredContent: output,
    };
  }

  return { content };
}

export function formatToolError(error: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
    isError: true,
  };
}
