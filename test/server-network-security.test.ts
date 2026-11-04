import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// Set production mode to test API layer directly without Vite frontend build overhead
process.env.NODE_ENV = 'production';

import { startServer } from '../server.ts';

test('Server Network Security: default loopback binding and transport-level rejection of foreign origins/hosts on AI routes', async () => {
  // Start server with dynamic port
  const server = await startServer({ port: 0 });
  const address = server.address() as AddressInfo;
  assert.ok(address, 'Server address must be populated upon startServer resolution');
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Verify default listener is loopback (127.0.0.1)
    assert.equal(address.address, '127.0.0.1', 'Default listening host must be 127.0.0.1 loopback');

    // 2. Untrusted Origin on /api/ai/review-document and alias /api/ai/review-proposals
    for (const path of ['/api/ai/review-document', '/api/ai/review-proposals']) {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://malicious-site.com',
          'Host': `127.0.0.1:${port}`,
        },
        body: JSON.stringify({ consent: true }),
      });
      assert.equal(res.status, 403, `${path} must reject untrusted Origin with 403`);
      const data = await res.json() as { error: string };
      assert.match(data.error, /DocForm local/, `${path} error message explains rejection`);
    }

    // 3. Untrusted Origin on /api/ai/review-full-text and alias /api/ai/full-text-review
    for (const path of ['/api/ai/review-full-text', '/api/ai/full-text-review']) {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://evil.attacker.org',
          'Host': `127.0.0.1:${port}`,
        },
        body: JSON.stringify({ provider: 'gemini' }),
      });
      assert.equal(res.status, 403, `${path} must reject untrusted Origin with 403`);
      const data = await res.json() as { error: string };
      assert.match(data.error, /DocForm local/, `${path} error message explains rejection`);
    }

    // 4. Untrusted Host header on AI routes (sent via http.request to preserve forbidden Host header on the wire)
    const hostTamperedRes = await new Promise<{ statusCode: number; data: string }>((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/ai/review-proposals',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'attacker-controlled.net',
        },
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode || 0, data }));
      });
      req.on('error', reject);
      req.write(JSON.stringify({ consent: true }));
      req.end();
    });
    assert.equal(hostTamperedRes.statusCode, 403, 'Request with spoofed foreign Host header must be rejected with 403');

    // 5. Untrusted Origin on other AI endpoints
    for (const path of ['/api/ai/format-document', '/api/ai/refine-text', '/api/ai/check-partitions', '/api/ai/test-connection']) {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://unauthorized-domain.com',
          'Host': `127.0.0.1:${port}`,
        },
        body: JSON.stringify(path === '/api/ai/test-connection' ? { provider: 'openai_api' } : {}),
      });
      assert.equal(res.status, 403, `${path} must reject foreign Origin with 403 before invoking AI`);
    }

    // 6. Valid local loopback request
    const validLocalRes = await fetch(`${baseUrl}/api/ai/review-proposals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': `127.0.0.1:${port}`,
        'Origin': `http://127.0.0.1:${port}`,
      },
      body: JSON.stringify({ structured: null }),
    });
    assert.equal(validLocalRes.status, 400, 'Valid local request reaches application validation (returns 400 for invalid body, not 403)');

  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
