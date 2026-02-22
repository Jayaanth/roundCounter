'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Patch path.join to use :memory: for SQLite
const path = require('path');
const origJoin = path.join.bind(path);
path.join = (...args) => {
  const result = origJoin(...args);
  if (result.endsWith('data.db')) return ':memory:';
  return result;
};

const app = require('../server');

let server;
let baseUrl;

before(() => new Promise((resolve) => {
  server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
    resolve();
  });
}));

after(() => new Promise((resolve) => { server.close(resolve); }));


function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + path);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(JSON.stringify(body)) } : {},
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { resolve({ status: res.statusCode, body: JSON.parse(data) }); });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

test('GET /api/activities - returns empty array initially', async () => {
  const { status, body } = await req('GET', '/api/activities');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
});

test('POST /api/activities - creates a new activity', async () => {
  const { status, body } = await req('POST', '/api/activities', { name: 'Running' });
  assert.equal(status, 201);
  assert.ok(body.id);
  assert.equal(body.name, 'Running');
});

test('POST /api/activities - duplicate name returns 409', async () => {
  await req('POST', '/api/activities', { name: 'Cycling' });
  const { status, body } = await req('POST', '/api/activities', { name: 'Cycling' });
  assert.equal(status, 409);
  assert.ok(body.error);
});

test('POST /api/activities - empty name returns 400', async () => {
  const { status } = await req('POST', '/api/activities', { name: '' });
  assert.equal(status, 400);
});

test('POST /api/activities/:id/laps - records a lap', async () => {
  const { body: act } = await req('POST', '/api/activities', { name: 'Swimming' });
  const { status, body } = await req('POST', `/api/activities/${act.id}/laps`);
  assert.equal(status, 201);
  assert.ok(body.id);
  assert.equal(body.activity_id, act.id);
});

test('GET /api/activities/:id/laps - returns laps', async () => {
  const { body: act } = await req('POST', '/api/activities', { name: 'Yoga' });
  await req('POST', `/api/activities/${act.id}/laps`);
  await req('POST', `/api/activities/${act.id}/laps`);
  const { status, body } = await req('GET', `/api/activities/${act.id}/laps`);
  assert.equal(status, 200);
  assert.equal(body.laps.length, 2);
});

test('DELETE /api/activities/:id/laps/:lapId - deletes a lap', async () => {
  const { body: act } = await req('POST', '/api/activities', { name: 'Rowing' });
  const { body: lap } = await req('POST', `/api/activities/${act.id}/laps`);
  const { status } = await req('DELETE', `/api/activities/${act.id}/laps/${lap.id}`);
  assert.equal(status, 200);
  const { body } = await req('GET', `/api/activities/${act.id}/laps`);
  assert.equal(body.laps.length, 0);
});

test('DELETE /api/activities/:id - deletes activity', async () => {
  const { body: act } = await req('POST', '/api/activities', { name: 'Hiking' });
  const { status } = await req('DELETE', `/api/activities/${act.id}`);
  assert.equal(status, 200);
  const { status: s2 } = await req('GET', `/api/activities/${act.id}/laps`);
  assert.equal(s2, 404);
});

test('GET /api/activities - returns lap_count', async () => {
  const { body: act } = await req('POST', '/api/activities', { name: 'Jumping' });
  await req('POST', `/api/activities/${act.id}/laps`);
  await req('POST', `/api/activities/${act.id}/laps`);
  await req('POST', `/api/activities/${act.id}/laps`);
  const { body } = await req('GET', '/api/activities');
  const found = body.find(a => a.id === act.id);
  assert.ok(found);
  assert.equal(found.lap_count, 3);
});
