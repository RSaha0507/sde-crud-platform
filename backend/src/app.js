const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { getConfig } = require('./config');
const { quoteIdentifier } = require('./identifiers');
const { validateModel, coerceAndValidateRecord } = require('./validation');
const { reconcileSchema, run, all } = require('./schema');

function createApp(options = {}) {
  const config = getConfig(options);
  const app = express();
  app.set('trust proxy', config.TRUST_PROXY);
  const { MODELS_DIR, DB_FILE } = config;
  const modelCache = new Map();
  const db = new sqlite3.Database(DB_FILE);
  let ready = Promise.resolve();

  function errorMessage(error) {
    if (/UNIQUE constraint failed/i.test(error.message)) return 'Unique constraint failed';
    return error.message;
  }

  async function loadModelsFromDisk() {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
    const nextModels = new Map();
    for (const file of fs.readdirSync(MODELS_DIR).filter((item) => item.endsWith('.json'))) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(MODELS_DIR, file), 'utf8'));
        const model = validateModel(raw);
        await reconcileSchema(db, model);
        nextModels.set(model.name.toLowerCase(), model);
      } catch (error) {
        console.error(`[Error] Failed to load model ${file}: ${error.message}`);
      }
    }
    modelCache.clear();
    for (const [key, model] of nextModels) modelCache.set(key, model);
  }

  function modelMiddleware(notFoundMessage) {
    return (req, res, next) => {
      ready
        .then(() => {
          const model = modelCache.get(req.params.modelName.toLowerCase());
          if (!model) return res.status(404).json({ message: notFoundMessage });
          req.model = model;
          req.tableName = model.tableName;
          return next();
        })
        .catch((error) => respondError(res, error, 500));
    };
  }

  function respondError(res, error, status = 400, req) {
    const message = errorMessage(error);
    const code = message === 'Unique constraint failed' ? 409 : status;
    const requestId = (req || res.req).id;
    return res.status(code).json({ message, requestId });
  }

  function auth(req, res, next) {
    const role = req.headers['x-user-role'] || 'Viewer';
    req.user = {
      role,
      id:
        role === 'Manager'
          ? 'user_manager_123'
          : role === 'Admin'
            ? 'user_admin_789'
            : 'user_viewer_456',
    };
    next();
  }

  function authorize(operation) {
    return (req, res, next) => {
      const permissions = (req.model.rbac && req.model.rbac[req.user.role]) || [];
      if (permissions.includes('all') || permissions.includes(operation)) return next();
      return res.status(403).json({ message: 'Forbidden: You do not have permission.' });
    };
  }

  async function getRecord(model, id) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM ${quoteIdentifier(model.tableName, 'tableName')} WHERE "id" = ?`,
        [id],
        (error, row) => {
          if (error) reject(error);
          else resolve(row);
        },
      );
    });
  }

  function enforceOwnership(req, res, next) {
    const { ownerField } = req.model;
    if (!ownerField) return next();
    getRecord(req.model, req.params.id)
      .then((record) => {
        if (!record) return res.status(404).json({ message: 'Record not found' });
        if (record[ownerField] !== req.user.id) {
          return res.status(403).json({ message: 'Forbidden: You do not own this record.' });
        }
        return next();
      })
      .catch((error) => respondError(res, error, 500));
  }

  async function createRecord(req, res) {
    try {
      const input = { ...req.body };
      if (req.model.ownerField)
        input[req.model.ownerField] = req.user ? req.user.id : input[req.model.ownerField];
      const valuesByName = coerceAndValidateRecord(req.model, input);
      const names = Object.keys(valuesByName);
      const table = quoteIdentifier(req.model.tableName, 'tableName');
      const columns = names.map((name) => quoteIdentifier(name, 'field name')).join(', ');
      const placeholders = names.map(() => '?').join(', ');
      const result = await run(
        db,
        `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
        names.map((name) => valuesByName[name]),
      );
      return res.status(201).json({ id: result.lastID, ...input });
    } catch (error) {
      return respondError(res, error);
    }
  }

  async function updateRecord(req, res) {
    try {
      const current = await getRecord(req.model, req.params.id);
      if (!current) return res.status(404).json({ message: 'Record not found' });
      const merged = { ...current, ...req.body };
      delete merged.id;
      if (req.model.ownerField) merged[req.model.ownerField] = current[req.model.ownerField];
      const valuesByName = coerceAndValidateRecord(req.model, merged);
      const names = Object.keys(valuesByName).filter((name) =>
        Object.prototype.hasOwnProperty.call(req.body, name),
      );
      if (!names.length) return res.status(400).json({ message: 'At least one field is required' });
      const setClause = names
        .map((name) => `${quoteIdentifier(name, 'field name')} = ?`)
        .join(', ');
      await run(
        db,
        `UPDATE ${quoteIdentifier(req.model.tableName, 'tableName')} SET ${setClause} WHERE "id" = ?`,
        [...names.map((name) => valuesByName[name]), req.params.id],
      );
      return res.json({ id: Number(req.params.id), ...req.body });
    } catch (error) {
      return respondError(res, error);
    }
  }

  app.use((req, res, next) => {
    req.id = req.get('x-request-id') || crypto.randomUUID();
    res.setHeader('x-request-id', req.id);
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      console.log(
        JSON.stringify({
          event: 'http_request',
          requestId: req.id,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
        }),
      );
    });
    next();
  });
  app.use(helmet());
  app.use(
    cors({
      origin:
        config.CORS_ORIGIN === '*'
          ? true
          : (origin, callback) => {
              if (
                !origin ||
                config.CORS_ORIGIN.split(',')
                  .map((item) => item.trim())
                  .includes(origin)
              ) {
                return callback(null, origin);
              }
              const error = new Error('Not allowed by CORS');
              error.status = 403;
              return callback(error);
            },
      optionsSuccessStatus: 204,
    }),
  );
  app.use(
    rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      limit: config.RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (req, res) =>
        res.status(429).json({ message: 'Too many requests', requestId: req.id }),
    }),
  );
  app.use(express.json({ limit: config.BODY_LIMIT }));

  app.get('/healthz', (req, res) => res.json({ status: 'ok', requestId: req.id }));
  app.get('/readyz', async (req, res) => {
    try {
      await ready;
      await new Promise((resolve, reject) =>
        db.get('SELECT 1', (error) => (error ? reject(error) : resolve())),
      );
      return res.json({ status: 'ready', requestId: req.id });
    } catch {
      return res
        .status(503)
        .json({ status: 'not_ready', message: 'Database unavailable', requestId: req.id });
    }
  });

  app.post('/admin/api/models/publish', async (req, res) => {
    try {
      const model = validateModel(req.body);
      fs.mkdirSync(MODELS_DIR, { recursive: true });
      await ready;
      await reconcileSchema(db, model);
      fs.writeFileSync(path.join(MODELS_DIR, `${model.name}.json`), JSON.stringify(model, null, 2));
      ready = ready.then(() => loadModelsFromDisk());
      await ready;
      return res.status(201).json({ message: `Model '${model.name}' published successfully.` });
    } catch (error) {
      return respondError(res, error);
    }
  });

  app.get('/admin/api/models', async (req, res) => {
    try {
      await ready;
      return res.json(Array.from(modelCache.values()));
    } catch (error) {
      return respondError(res, error, 500);
    }
  });

  const adminDataRouter = express.Router({ mergeParams: true });
  adminDataRouter.use(modelMiddleware('Model not found'));
  adminDataRouter.get('/', async (req, res) => {
    try {
      const rows = await all(
        db,
        `SELECT * FROM ${quoteIdentifier(req.model.tableName, 'tableName')}`,
      );
      return res.json(rows);
    } catch (error) {
      return respondError(res, error, 500);
    }
  });
  adminDataRouter.post('/', (req, res) => createRecord(req, res));
  adminDataRouter.put('/:id', (req, res) => updateRecord(req, res));
  adminDataRouter.delete('/:id', async (req, res) => {
    try {
      const result = await run(
        db,
        `DELETE FROM ${quoteIdentifier(req.model.tableName, 'tableName')} WHERE "id" = ?`,
        [req.params.id],
      );
      if (!result.changes) return res.status(404).json({ message: 'Record not found' });
      return res.json({ message: 'Record deleted successfully' });
    } catch (error) {
      return respondError(res, error, 500);
    }
  });
  app.use('/admin/api/data/:modelName', adminDataRouter);

  const publicApiRouter = express.Router();
  publicApiRouter.use(auth);
  publicApiRouter.use('/:modelName', modelMiddleware('API endpoint not found'));
  publicApiRouter.get('/:modelName', authorize('read'), async (req, res) => {
    try {
      return res.json(
        await all(db, `SELECT * FROM ${quoteIdentifier(req.model.tableName, 'tableName')}`),
      );
    } catch (error) {
      return respondError(res, error, 500);
    }
  });
  publicApiRouter.get('/:modelName/:id', authorize('read'), async (req, res) => {
    try {
      const row = await getRecord(req.model, req.params.id);
      return row ? res.json(row) : res.status(404).json({ message: 'Record not found' });
    } catch (error) {
      return respondError(res, error, 500);
    }
  });
  publicApiRouter.post('/:modelName', authorize('create'), (req, res) => createRecord(req, res));
  publicApiRouter.put('/:modelName/:id', authorize('update'), enforceOwnership, (req, res) =>
    updateRecord(req, res),
  );
  publicApiRouter.delete(
    '/:modelName/:id',
    authorize('delete'),
    enforceOwnership,
    async (req, res) => {
      try {
        await run(
          db,
          `DELETE FROM ${quoteIdentifier(req.model.tableName, 'tableName')} WHERE "id" = ?`,
          [req.params.id],
        );
        return res.json({ message: 'Record deleted successfully' });
      } catch (error) {
        return respondError(res, error, 500);
      }
    },
  );
  app.use('/api', publicApiRouter);

  ready = loadModelsFromDisk();
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || (error.type === 'entity.too.large' ? 413 : 500);
    console.error(
      JSON.stringify({ event: 'http_error', requestId: req.id, message: error.message, status }),
    );
    return res.status(status).json({
      message: status === 500 ? 'Internal server error' : error.message,
      requestId: req.id,
    });
  });
  return {
    app,
    db,
    config,
    close: () =>
      new Promise((resolve, reject) => db.close((error) => (error ? reject(error) : resolve()))),
  };
}

module.exports = { createApp };
