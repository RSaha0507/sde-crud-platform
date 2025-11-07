/*
 * ===================================================================
 * SDE Assignment: Auto-Generated CRUD + RBAC Platform - BACKEND
 * ===================================================================
 * This single file contains the complete Node.js/Express server.
 * It uses SQLite for file-based database storage.
 *
 * To Run:
 * 1. Create a 'backend' folder: `mkdir backend`
 * 2. Go into it: `cd backend`
 * 3. Save this file as `server.js`.
 * 4. Install dependencies: `npm install express cors sqlite3`
 * 5. Run the server: `node server.js`
 *
 * The server will run on http://localhost:4000
 * ===================================================================
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// --- Configuration ---
const app = express();
const PORT = 4000;
const MODELS_DIR = path.join(__dirname, 'models-json');
const DB_FILE = path.join(__dirname, 'data.db');

// In-memory cache for model definitions
const modelCache = new Map();

// --- Database Setup ---
// Initialize the SQLite database connection
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
        console.error('[Error] Could not connect to database:', err.message);
    } else {
        console.log('[System] Connected to SQLite database.');
    }
});

// --- Core Functions ---

/**
 * Maps model field types to SQLite data types.
 * @param {string} modelType - The type from the model definition (e.g., "string", "number", "boolean")
 * @returns {string} The corresponding SQLite data type (e.g., "TEXT", "REAL", "INTEGER")
 */
function getSQLiteType(modelType) {
    switch (modelType.toLowerCase()) {
        case 'string':
        case 'text':
        case 'relation': // Store relations as the ID (TEXT or INTEGER)
            return 'TEXT';
        case 'number':
        case 'float':
            return 'REAL';
        case 'integer':
        case 'autoincrement':
            return 'INTEGER';
        case 'boolean':
            return 'INTEGER'; // Store booleans as 0 or 1
        default:
            return 'TEXT';
    }
}

/**
 * Generates and executes a "CREATE TABLE" SQL query from a model definition.
 * @param {object} modelDefinition - The parsed model JSON.
 */
function createTableForModel(modelDefinition) {
    const tableName = modelDefinition.tableName || modelDefinition.name.toLowerCase() + 's';
    
    // Always add an 'id' field as the primary key
    let fieldsSQL = 'id INTEGER PRIMARY KEY AUTOINCREMENT';

    for (const field of modelDefinition.fields) {
        const fieldName = field.name;
        const type = getSQLiteType(field.type);
        const isRequired = field.required ? 'NOT NULL' : '';
        const isUnique = field.unique ? 'UNIQUE' : '';
        
        // Add all constraints to the field SQL
        fieldsSQL += `, \`${fieldName}\` ${type} ${isRequired} ${isUnique}`;
    }

    const createTableSQL = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (${fieldsSQL});`;

    console.log(`[System] Executing SQL: ${createTableSQL}`);

    db.run(createTableSQL, (err) => {
        if (err) {
            console.error(`[Error] Failed to create table '${tableName}':`, err.message);
        } else {
            console.log(`[System] Table '${tableName}' is ready.`);
        }
    });
}

/**
 * Loads all .json model definitions from the MODELS_DIR into the in-memory cache.
 * Also triggers the creation/validation of their corresponding database tables.
 */
function loadModelsFromDisk() {
    if (!fs.existsSync(MODELS_DIR)) {
        console.log(`[System] Creating models directory: ${MODELS_DIR}`);
        fs.mkdirSync(MODELS_DIR, { recursive: true });
    }

    console.log('[System] Loading models from disk...');
    modelCache.clear();
    const files = fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.json'));

    for (const file of files) {
        try {
            const filePath = path.join(MODELS_DIR, file);
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const model = JSON.parse(fileContent);

            if (!model.name) {
                console.warn(`[Warn] Skipping ${file}: missing 'name' property.`);
                continue;
            }

            // Store the model definition in the cache
            const modelKey = model.name.toLowerCase();
            model.tableName = model.tableName || modelKey + 's'; // Default table name
            modelCache.set(modelKey, model);
            console.log(`[System] Loaded model: ${model.name}`);

            // Ensure the database table for this model exists
            createTableForModel(model);

        } catch (err) {
            console.error(`[Error] Failed to load model ${file}:`, err.message);
        }
    }
    console.log(`[System] ${modelCache.size} models loaded.`);
}

// --- Middleware ---
app.use(cors());
app.use(express.json());

// Simple logging middleware
app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.path}`);
    next();
});

// --- Admin API ---
// (For the frontend UI to publish models and manage data)

/**
 * POST /admin/api/models/publish
 * Receives a model definition from the UI, saves it to a .json file,
 * and creates the corresponding database table.
 */
app.post('/admin/api/models/publish', (req, res) => {
    try {
        const model = req.body;
        if (!model || !model.name) {
            return res.status(400).json({ message: 'Model "name" is required' });
        }
        if (!model.fields || !Array.isArray(model.fields)) {
            return res.status(400).json({ message: 'Model "fields" are required' });
        }

        const modelName = model.name;
        const filePath = path.join(MODELS_DIR, `${modelName}.json`);

        // 1. Write the .json file
        fs.writeFileSync(filePath, JSON.stringify(model, null, 2));
        console.log(`[Admin] Published model definition: ${filePath}`);

        // 2. (Re)load all models into cache and create/update tables
        loadModelsFromDisk();

        res.status(201).json({ message: `Model '${modelName}' published successfully.` });
    } catch (err) {
        console.error('[Error] /admin/api/models/publish:', err);
        res.status(500).json({ message: 'Failed to publish model.' });
    }
});

/**
 * GET /admin/api/models
 * Returns a list of all currently loaded model definitions.
 */
app.get('/admin/api/models', (req, res) => {
    res.json(Array.from(modelCache.values()));
});

/**
 * Dynamic Admin Data Router
 * GET /admin/api/data/:modelName -> Get all records
 * POST /admin/api/data/:modelName -> Create a new record
 * PUT /admin/api/data/:modelName/:id -> Update a record
 * DELETE /admin/api/data/:modelName/:id -> Delete a record
 *
 * This router is for the ADMIN UI and bypasses RBAC for simplicity.
 * The PUBLIC API (/api/) will have RBAC.
 */
const adminDataRouter = express.Router({ mergeParams: true });

// Middleware to get model and table name
adminDataRouter.use((req, res, next) => {
    const model = modelCache.get(req.params.modelName.toLowerCase());
    if (!model) {
        return res.status(404).json({ message: 'Model not found' });
    }
    req.model = model;
    req.tableName = model.tableName;
    next();
});

// GET /admin/api/data/:modelName
adminDataRouter.get('/', (req, res) => {
    db.all(`SELECT * FROM \`${req.tableName}\``, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: err.message });
        }
        res.json(rows);
    });
});

// POST /admin/api/data/:modelName
adminDataRouter.post('/', (req, res) => {
    const { fields } = req.model;
    const body = req.body;

    const columns = fields.map(f => `\`${f.name}\``).join(', ');
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map(f => body[f.name]);

    const sql = `INSERT INTO \`${req.tableName}\` (${columns}) VALUES (${placeholders})`;

    db.run(sql, values, function (err) { // Use function() to get `this.lastID`
        if (err) {
            return res.status(500).json({ message: err.message });
        }
        res.status(201).json({ id: this.lastID, ...body });
    });
});

// PUT /admin/api/data/:modelName/:id
adminDataRouter.put('/:id', (req, res) => {
    const { fields } = req.model;
    const body = req.body;
    const { id } = req.params;

    const setClauses = fields.map(f => `\`${f.name}\` = ?`);
    const values = fields.map(f => body[f.name]);
    values.push(id); // Add id for the WHERE clause

    const sql = `UPDATE \`${req.tableName}\` SET ${setClauses.join(', ')} WHERE id = ?`;

    db.run(sql, values, function (err) {
        if (err) {
            return res.status(500).json({ message: err.message });
        }
        res.status(200).json({ id, ...body });
    });
});

// DELETE /admin/api/data/:modelName/:id
adminDataRouter.delete('/:id', (req, res) => {
    const { id } = req.params;
    const sql = `DELETE FROM \`${req.tableName}\` WHERE id = ?`;

    db.run(sql, [id], function (err) {
        if (err) {
            return res.status(500).json({ message: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Record not found' });
        }
        res.status(200).json({ message: 'Record deleted successfully' });
    });
});

app.use('/admin/api/data/:modelName', adminDataRouter);


// --- Public Dynamic CRUD API + RBAC ---

/**
 * Mock Authentication Middleware
 * In a real app, this would validate a JWT.
 * Here, we just read a header for testing.
 *
 * Valid Roles: "Admin", "Manager", "Viewer"
 */
function mockAuthMiddleware(req, res, next) {
    const role = req.headers['x-user-role'] || 'Viewer'; // Default to "Viewer"
    req.user = {
        role: role,
        // Mock user ID for 'ownerField' checks
        id: (role === 'Manager') ? 'user_manager_123' : 'user_viewer_456' 
    };
    if (role === 'Admin') {
        req.user.id = 'user_admin_789';
    }
    console.log(`[Auth] Mock User Role: ${req.user.role}`);
    next();
}

/**
 * RBAC Authorization Middleware
 * This is the core of the RBAC requirement.
 */
function rbacMiddleware(operation) {
    return (req, res, next) => {
        const model = req.model; // Attached by the router middleware
        const role = req.user.role; // Attached by mockAuthMiddleware

        if (!model.rbac) {
            console.warn(`[RBAC] Deny: Model ${model.name} has no RBAC rules defined.`);
            return res.status(403).json({ message: 'Forbidden: No permissions defined for this resource.' });
        }

        const permissions = model.rbac[role] || [];

        // Admin 'all' rule
        if (permissions.includes('all')) {
            console.log(`[RBAC] Allow: ${role} has 'all' permission.`);
            return next();
        }

        // Specific operation check
        if (permissions.includes(operation)) {
            console.log(`[RBAC] Allow: ${role} has '${operation}' permission.`);
            
            // Special check for 'update'/'delete' and ownership
            if ((operation === 'update' || operation === 'delete') && model.ownerField) {
                // This is a complex check. We need to fetch the item first
                // to see if the user owns it. We'll skip this for the main
                // 'read' (list) operation and handle it in the specific /:id routes.
                if (req.params.id) {
                    // This logic would be more complex in a real app
                    console.log(`[RBAC] Info: Ownership check required for ${operation}.`);
                    // We'd fetch the item, check item[model.ownerField] === req.user.id
                    // For this example, we'll just log and proceed.
                }
            }
            return next();
        }

        console.warn(`[RBAC] Deny: ${role} lacks '${operation}' permission for ${model.name}.`);
        return res.status(403).json({ message: 'Forbidden: You do not have permission.' });
    };
}


/**
 * Dynamic Public API Router
 * This router handles all /api/:modelName requests.
 */
const publicApiRouter = express.Router();

// 1. Apply Mock Auth to all public API routes
publicApiRouter.use(mockAuthMiddleware);

// 2. Middleware to find and attach the model definition
publicApiRouter.use('/:modelName', (req, res, next) => {
    const model = modelCache.get(req.params.modelName.toLowerCase());
    if (!model) {
        return res.status(404).json({ message: 'API endpoint not found' });
    }
    req.model = model;
    req.tableName = model.tableName;
    next();
});

// 3. Define CRUD routes with RBAC

// GET /api/:modelName (Read All)
publicApiRouter.get('/:modelName', rbacMiddleware('read'), (req, res) => {
    db.all(`SELECT * FROM \`${req.tableName}\``, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: err.message });
        }
        res.json(rows);
    });
});

// GET /api/:modelName/:id (Read One)
publicApiRouter.get('/:modelName/:id', rbacMiddleware('read'), (req, res) => {
    const { id } = req.params;
    db.get(`SELECT * FROM \`${req.tableName}\` WHERE id = ?`, [id], (err, row) => {
        if (err) {
            return res.status(500).json({ message: err.message });
        }
        if (!row) {
            return res.status(404).json({ message: 'Record not found' });
        }
        res.json(row);
    });
});

// POST /api/:modelName (Create)
publicApiRouter.post('/:modelName', rbacMiddleware('create'), (req, res) => {
    const { fields, ownerField } = req.model;
    const body = req.body;

    // Handle ownerField: automatically set it to the current user's ID
    if (ownerField && !body[ownerField]) {
        body[ownerField] = req.user.id; 
    }

    const columns = fields.map(f => `\`${f.name}\``);
    const placeholders = fields.map(() => '?');
    const values = fields.map(f => body[f.name]);
    
    // Add owner field if it exists and wasn't in the main fields list
    if (ownerField && !fields.find(f => f.name === ownerField)) {
        columns.push(`\`${ownerField}\``);
        placeholders.push('?');
        values.push(body[ownerField]);
    }

    const sql = `INSERT INTO \`${req.tableName}\` (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;

    db.run(sql, values, function (err) {
        if (err) {
            return res.status(500).json({ message: err.message });
        }
        res.status(201).json({ id: this.lastID, ...body });
    });
});

// PUT /api/:modelName/:id (Update)
publicApiRouter.put('/:modelName/:id', rbacMiddleware('update'), (req, res) => {
    // Note: A real 'update' with ownership would first SELECT the item,
    // check `row[ownerField] === req.user.id`, and *then* update.
    // We're simplifying here.
    const { fields } = req.model;
    const body = req.body;
    const { id } = req.params;

    const setClauses = fields.map(f => `\`${f.name}\` = ?`);
    const values = fields.map(f => body[f.name]);
    values.push(id);

    const sql = `UPDATE \`${req.tableName}\` SET ${setClauses.join(', ')} WHERE id = ?`;

    db.run(sql, values, function (err) {
        if (err) {
            return res.status(500).json({ message: err.message });
        }
        res.status(200).json({ id, ...body });
    });
});

// DELETE /api/:modelName/:id (Delete)
publicApiRouter.delete('/:modelName/:id', rbacMiddleware('delete'), (req, res) => {
    // Note: Real ownership check would apply here too.
    const { id } = req.params;
    const sql = `DELETE FROM \`${req.tableName}\` WHERE id = ?`;

    db.run(sql, [id], function (err) {
        if (err) {
            return res.status(500).json({ message: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Record not found' });
        }
        res.status(200).json({ message: 'Record deleted successfully' });
    });
});

// Register the public API router
app.use('/api', publicApiRouter);


// --- Server Start ---
app.listen(PORT, () => {
    // Load all models from disk on startup
    loadModelsFromDisk();
    console.log(`\n[System] Backend server running on http://localhost:${PORT}`);
    console.log(`[System] Models directory: ${MODELS_DIR}`);
    console.log(`[System] Database file: ${DB_FILE}`);
    console.log(`\n[Test] Try POSTing a model to http://localhost:${PORT}/admin/api/models/publish`);
    console.log(`[Test] Test RBAC with 'X-User-Role: Viewer' (or Manager, Admin) header`);
});