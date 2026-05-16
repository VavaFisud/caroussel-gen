import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCarouselTools } from './mcp-tools.js';

export function createCarouselMcpServer() {
  const server = new McpServer({
    name: 'carousel-gen',
    version: '1.0.0'
  });

  registerCarouselTools(server);
  return server;
}
