import { createCarouselMcpHttpApp } from './mcp-http-app.js';

const app = createCarouselMcpHttpApp();
const port = Number(process.env.PORT || 3333);

app.listen(port, () => {
  console.log(`Carousel MCP HTTP server: http://localhost:${port}/mcp`);
});
