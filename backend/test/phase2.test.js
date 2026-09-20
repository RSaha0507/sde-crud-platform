const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');

function createSetup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sde-crud-phase2-'));
  const config = {
    DB_FILE: path.join(directory, 'test.db'),
    MODELS_DIR: path.join(directory, 'models'),
  };
  const instance = createApp(config);
  return { directory, instance, api: request(instance.app) };
}

function baseModel(overrides = {}) {
  return {
    name: 'OwnedItem',
    ownerField: 'ownerId',
    fields: [
      { name: 'title', type: 'string', required: true, unique: true },
      { name: 'count', type: 'integer', required: true, unique: false },
    ],
    rbac: { Admin: ['all'], Manager: ['create', 'read', 'update', 'delete'], Viewer: ['read'] },
    ...overrides,
  };
}

async function closeSetup(t, setup) {
  t.after(async () => {
    await setup.instance.close();
    fs.rmSync(setup.directory, { recursive: true, force: true });
  });
  return setup;
}

test('rejects invalid models and unsafe SQL identifiers', async (t) => {
  const setup = await closeSetup(t, createSetup());
  for (const body of [
    { ...baseModel(), name: 'bad-name' },
    { ...baseModel(), tableName: 'items; DROP TABLE users' },
    { ...baseModel(), fields: [{ name: 'bad name', type: 'string' }] },
    { ...baseModel(), fields: [{ name: 'title', type: 'date' }] },
    {
      ...baseModel(),
      fields: [
        { name: 'title', type: 'string' },
        { name: 'title', type: 'string' },
      ],
    },
  ]) {
    const response = await setup.api.post('/admin/api/models/publish').send(body);
    assert.equal(response.status, 400);
  }
});

test('enforces required, type, and unique constraints', async (t) => {
  const setup = await closeSetup(t, createSetup());
  assert.equal((await setup.api.post('/admin/api/models/publish').send(baseModel())).status, 201);
  assert.equal((await setup.api.post('/admin/api/data/owneditem').send({ count: 1 })).status, 400);
  assert.equal(
    (await setup.api.post('/admin/api/data/owneditem').send({ title: 'one', count: 'wrong' }))
      .status,
    400,
  );
  assert.equal(
    (await setup.api.post('/admin/api/data/owneditem').send({ title: 'one', count: 1 })).status,
    201,
  );
  assert.equal(
    (await setup.api.post('/admin/api/data/owneditem').send({ title: 'one', count: 2 })).status,
    409,
  );
});

test('assigns owners and allows only owners to update or delete publicly', async (t) => {
  const setup = await closeSetup(t, createSetup());
  assert.equal((await setup.api.post('/admin/api/models/publish').send(baseModel())).status, 201);
  const created = await setup.api
    .post('/api/owneditem')
    .set('X-User-Role', 'Manager')
    .send({ title: 'owned', count: 1, ownerId: 'attacker' });
  assert.equal(created.status, 201);
  assert.equal(created.body.ownerId, 'user_manager_123');
  assert.equal(
    (
      await setup.api
        .put(`/api/owneditem/${created.body.id}`)
        .set('X-User-Role', 'Viewer')
        .send({ title: 'blocked' })
    ).status,
    403,
  );
  assert.equal(
    (await setup.api.delete(`/api/owneditem/${created.body.id}`).set('X-User-Role', 'Viewer'))
      .status,
    403,
  );
  assert.equal(
    (
      await setup.api
        .put(`/api/owneditem/${created.body.id}`)
        .set('X-User-Role', 'Manager')
        .send({ title: 'updated' })
    ).status,
    200,
  );
  assert.equal(
    (await setup.api.delete(`/api/owneditem/${created.body.id}`).set('X-User-Role', 'Manager'))
      .status,
    200,
  );
});

test('adds optional fields during schema evolution and rejects unsafe required migrations', async (t) => {
  const setup = await closeSetup(t, createSetup());
  assert.equal(
    (await setup.api.post('/admin/api/models/publish').send(baseModel({ ownerField: undefined })))
      .status,
    201,
  );
  assert.equal(
    (await setup.api.post('/admin/api/data/owneditem').send({ title: 'existing', count: 1 }))
      .status,
    201,
  );
  assert.equal(
    (
      await setup.api.post('/admin/api/models/publish').send(
        baseModel({
          ownerField: undefined,
          fields: [
            ...baseModel().fields,
            { name: 'note', type: 'string', required: false, unique: false },
          ],
        }),
      )
    ).status,
    201,
  );
  assert.equal(
    (await setup.api.post('/admin/api/data/owneditem').send({ title: 'new', count: 2, note: 'ok' }))
      .status,
    201,
  );
  const failed = await setup.api.post('/admin/api/models/publish').send(
    baseModel({
      ownerField: undefined,
      fields: [
        ...baseModel().fields,
        { name: 'mustFill', type: 'string', required: true, unique: false },
      ],
    }),
  );
  assert.equal(failed.status, 400);
});
