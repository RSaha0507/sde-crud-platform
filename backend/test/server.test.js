const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');

function temporaryConfig() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sde-crud-platform-'));
  return {
    DB_FILE: path.join(directory, 'test.db'),
    MODELS_DIR: path.join(directory, 'models-json'),
    directory,
  };
}

function modelDefinition() {
  return {
    name: 'Widget',
    fields: [{ name: 'name', type: 'string', required: true, unique: false }],
    rbac: {
      Admin: ['all'],
      Manager: ['create', 'read', 'update'],
      Viewer: ['read'],
    },
  };
}

test('supports model discovery, RBAC, admin CRUD, and publishing', async (t) => {
  const config = temporaryConfig();
  fs.mkdirSync(config.MODELS_DIR, { recursive: true });
  fs.writeFileSync(path.join(config.MODELS_DIR, 'Widget.json'), JSON.stringify(modelDefinition()));
  const instance = createApp(config);
  t.after(async () => {
    await instance.close();
    fs.rmSync(config.directory, { recursive: true, force: true });
  });

  test('exposes liveness and readiness checks with request IDs', async (t) => {
    const config = temporaryConfig();
    const instance = createApp(config);
    t.after(async () => {
      await instance.close();
      fs.rmSync(config.directory, { recursive: true, force: true });
    });

    const api = request(instance.app);
    const health = await api.get('/healthz').set('X-Request-Id', 'health-test');
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, { status: 'ok', requestId: 'health-test' });
    assert.equal(health.headers['x-request-id'], 'health-test');

    const readiness = await api.get('/readyz');
    assert.equal(readiness.status, 200);
    assert.equal(readiness.body.status, 'ready');
    assert.match(readiness.body.requestId, /^[0-9a-f-]{36}$/);
  });

  test('applies security headers, body limits, and strict CORS', async (t) => {
    const config = {
      ...temporaryConfig(),
      CORS_ORIGIN: 'http://allowed.example',
      BODY_LIMIT: '1kb',
    };
    const instance = createApp(config);
    t.after(async () => {
      await instance.close();
      fs.rmSync(config.directory, { recursive: true, force: true });
    });

    const api = request(instance.app);
    const allowed = await api.get('/healthz').set('Origin', 'http://allowed.example');
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers['access-control-allow-origin'], 'http://allowed.example');
    assert.equal(allowed.headers['x-content-type-options'], 'nosniff');

    const blocked = await api.get('/healthz').set('Origin', 'http://blocked.example');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.message, 'Not allowed by CORS');

    const oversized = await api
      .post('/admin/api/models/publish')
      .set('Origin', 'http://allowed.example')
      .send({ payload: 'x'.repeat(2000) });
    assert.equal(oversized.status, 413);
    assert.equal(typeof oversized.body.requestId, 'string');
  });

  test('enforces the configurable rate limit', async (t) => {
    const config = { ...temporaryConfig(), RATE_LIMIT_MAX: 1 };
    const instance = createApp(config);
    t.after(async () => {
      await instance.close();
      fs.rmSync(config.directory, { recursive: true, force: true });
    });

    const api = request(instance.app);
    assert.equal((await api.get('/healthz')).status, 200);
    const limited = await api.get('/healthz');
    assert.equal(limited.status, 429);
    assert.equal(limited.body.message, 'Too many requests');
    assert.equal(typeof limited.body.requestId, 'string');
  });

  const api = request(instance.app);
  const models = await api.get('/admin/api/models');
  assert.equal(models.status, 200);
  assert.equal(models.body[0].name, 'Widget');

  const published = await api.post('/admin/api/models/publish').send({
    ...modelDefinition(),
    name: 'Gadget',
  });
  assert.equal(published.status, 201);

  const publishedModels = await api.get('/admin/api/models');
  assert.equal(publishedModels.status, 200);
  assert.equal(publishedModels.body.length, 2);

  const viewerRead = await api.get('/api/widget').set('X-User-Role', 'Viewer');
  assert.equal(viewerRead.status, 200);
  assert.deepEqual(viewerRead.body, []);

  const viewerCreate = await api
    .post('/api/widget')
    .set('X-User-Role', 'Viewer')
    .send({ name: 'blocked' });
  assert.equal(viewerCreate.status, 403);

  const created = await api.post('/admin/api/data/widget').send({ name: 'first' });
  assert.equal(created.status, 201);
  assert.equal(created.body.name, 'first');

  const updated = await api
    .put(`/admin/api/data/widget/${created.body.id}`)
    .send({ name: 'updated' });
  assert.equal(updated.status, 200);

  const listed = await api.get('/admin/api/data/widget');
  assert.equal(listed.status, 200);
  assert.equal(listed.body[0].name, 'updated');

  const deleted = await api.delete(`/admin/api/data/widget/${created.body.id}`);
  assert.equal(deleted.status, 200);

  const adminCreate = await api
    .post('/api/widget')
    .set('X-User-Role', 'Admin')
    .send({ name: 'admin-created' });
  assert.equal(adminCreate.status, 201);
});
