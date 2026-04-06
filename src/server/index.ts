/**
 * MCP EPUB Reader Server Entry Point
 * 
 * This module initializes the MCP server, registers all tools, and starts listening
 * on stdio transport. It handles graceful shutdown and error logging.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BookManagerImpl } from './book-manager';
import { registerTools } from './tool-registration';

/**
 * Start the MCP server and listen on stdio.
 * 
 * @returns A promise that resolves when the server shuts down gracefully.
 */
export async function startServer(): Promise<void> {
  // Create shared BookManager instance (dependency injection)
  const bookManager = new BookManagerImpl();
  
  // Create MCP server with capabilities for tools
  const server = new Server(
    {
      name: 'epub-reader',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );
  
  // Register all 13 tools
  registerTools(server, bookManager);
  
  // Create stdio transport and connect
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Log to stderr (stdio transport uses stdout for protocol)
  console.error('MCP EPUB Reader server started on stdio');
  
  // Wait for termination signals
  const shutdown = () => {
    console.error('Received shutdown signal, closing server...');
    server.close();
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  // Keep the process alive
  await new Promise<void>(() => {
    // This promise never resolves; the process will exit via signal handlers
  });
}

// If this module is the main entry point, start the server
if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}