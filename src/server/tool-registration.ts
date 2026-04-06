/**
 * Tool registration for MCP EPUB Reader server
 * 
 * This module registers all 13 tools with the MCP server, wiring Zod schemas
 * for input validation, error handling, and delegating to the appropriate
 * tool handler functions.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { BookManager } from './book-manager';
import { ToolName, ToolInputSchemas, validateToolInput } from '../utils/validation';


// Import tool factory functions
import { createOpenTool } from '../tools/open';
import { createCloseTool } from '../tools/close';
import { createListOpenBooksTool } from '../tools/list-books';
import { createNavigateNextTool, createNavigatePreviousTool } from '../tools/navigate';
import { createJumpToPageTool, createJumpToChapterTool } from '../tools/jump';
import { createGetPositionTool } from '../tools/position';
import { createSearchTool } from '../tools/search';
import { createGetTocTool } from '../tools/toc';
import { createGetMetadataTool } from '../tools/metadata';
import { createFootnoteTool } from '../tools/footnote';
import { createGetChapterSummaryTool } from '../tools/summary';

// Map tool names to their factory functions
const toolFactories = {
  'ebook/open': createOpenTool,
  'ebook/close': createCloseTool,
  'ebook/list_open_books': createListOpenBooksTool,
  'ebook/navigate_next': createNavigateNextTool,
  'ebook/navigate_previous': createNavigatePreviousTool,
  'ebook/jump_to_page': createJumpToPageTool,
  'ebook/jump_to_chapter': createJumpToChapterTool,
  'ebook/get_position': createGetPositionTool,
  'ebook/search': createSearchTool,
  'ebook/get_toc': createGetTocTool,
  'ebook/get_metadata': createGetMetadataTool,
  'ebook/get_footnote': createFootnoteTool,
  'ebook/get_chapter_summary': createGetChapterSummaryTool,
} as const;



/**
 * Register all tools with the MCP server.
 * 
 * Each tool is registered under the 'tools/call' request type, with the tool name
 * used to route to the appropriate handler. Input validation is performed using
 * the corresponding Zod schema from validation.ts.
 * 
 * @param server - MCP server instance
 * @param bookManager - Shared BookManager instance
 */
export function registerTools(server: Server, bookManager: BookManager): void {
  // Set up a single request handler for all tools/call requests
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    // Ensure tool exists
    if (!(name in toolFactories)) {
      return {
        error: {
          code: -32601, // Method not found
          message: `Unknown tool: ${name}`,
        },
      };
    }
    
    // At this point, name is guaranteed to be a valid ToolName
    const toolName = name as ToolName;
    
    try {
      // Get the factory and create the tool instance
      const factory = toolFactories[toolName];
      const tool = factory(bookManager);
      
      // Validate input and execute handler
      const validation = validateToolInput(toolName, args);
      if (!validation.success) {
        const { errors } = validation;
        return {
          error: {
            code: -32602, // Invalid params
            message: `Invalid input: ${errors.join(', ')}`,
          },
        };
      }
      
      const result = await tool.handler(validation.data);
      
      // Convert result to MCP tool result format
      // Assuming result is already a JSON-serializable object matching the tool's output type
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      // Convert application errors to MCP error responses
      return {
        error: {
          code: -32603, // Internal error
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });
}