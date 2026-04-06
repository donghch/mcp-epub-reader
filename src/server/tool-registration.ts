/**
 * Tool registration for MCP EPUB Reader server
 * 
 * This module registers all 13 tools with the MCP server, wiring Zod schemas
 * for input validation, error handling, and delegating to the appropriate
 * tool handler functions.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  PingRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { BookManager } from './book-manager';
import { validateToolInput } from '../utils/validation';
import {
  createToolRegistry,
  formatToolError,
  formatToolResult,
} from './tool-registry';

/**
 * Register all tools with the MCP server.
 *
 * Tool metadata and handlers are centralized in the shared registry so list/call
 * stay in sync.
 */
export function registerTools(server: Server, bookManager: BookManager): void {
  const registry = createToolRegistry(bookManager);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.listTools(),
  }));

  server.setRequestHandler(PingRequestSchema, async () => ({}));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = registry.getTool(request.params.name);

    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }

    const validation = validateToolInput(tool.name, request.params.arguments);

    if (!validation.success) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid input: ${validation.errors.join(', ')}`);
    }

    try {
      const result = await tool.execute(validation.data);
      return formatToolResult(result);
    } catch (error) {
      return formatToolError(error);
    }
  });
}
