import { Hono } from 'hono';

// from: CourseCore bff/src/routes/health.ts（逐字移植）
const health = new Hono();

health.get('/healthz', (c) => {
  return c.json({ status: 'ok', ts: new Date().toISOString() });
});

export { health };
