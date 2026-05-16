import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createCarouselMcpServer } from './mcp-server-factory.js';

const server = createCarouselMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
