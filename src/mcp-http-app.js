import { randomUUID } from 'node:crypto';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createCarouselMcpServer } from './mcp-server-factory.js';
import { findPublicFile, storageMode } from './public-files.js';

export function createCarouselMcpHttpApp() {
  const app = createMcpExpressApp({
    host: '0.0.0.0',
    allowedHosts: process.env.MCP_ALLOWED_HOSTS
      ? process.env.MCP_ALLOWED_HOSTS.split(',').map((host) => host.trim()).filter(Boolean)
      : undefined
  });
  const transports = {};

  app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'carousel-gen-mcp', storage_mode: storageMode() });
  });

  app.get('/files/:id', (req, res) => {
    const file = findPublicFile(req.params.id);
    if (!file) {
      res.status(404).json({ error: 'File not found or expired.' });
      return;
    }
    res.download(file.path, file.name);
  });

  app.post('/mcp', async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'];
      let transport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (newSessionId) => {
            transports[newSessionId] = transport;
          }
        });

        const server = createCarouselMcpServer();
        await server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: initialize first or send mcp-session-id' },
          id: null
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: error.message || 'Internal server error' },
          id: null
        });
      }
    }
  });

  app.get('/mcp', (req, res) => {
    res.status(405).set('Allow', 'POST').send('Method Not Allowed');
  });

  return app;
}
