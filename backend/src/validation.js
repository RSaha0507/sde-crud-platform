const { validateIdentifier } = require('./identifiers');

const TYPES = new Set([
  'string',
  'text',
  'relation',
  'number',
  'float',
  'integer',
  'autoincrement',
  'boolean',
]);
const OPERATIONS = new Set(['all', 'create', 'read', 'update', 'delete']);

function validateModel(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Model must be an object');
  }
  if (typeof input.name !== 'string' || !input.name.trim()) {
    throw new Error('Model "name" is required');
  }
  validateIdentifier(input.name, 'Model name');
  const tableName = input.tableName || `${input.name.toLowerCase()}s`;
  validateIdentifier(tableName, 'Model tableName');
  if (!Array.isArray(input.fields)) {
    throw new Error('Model "fields" are required');
  }

  const names = new Set(['id']);
  const fields = input.fields.map((field) => {
    if (!field || typeof field !== 'object' || Array.isArray(field)) {
      throw new Error('Each model field must be an object');
    }
    validateIdentifier(field.name, 'Field name');
    if (names.has(field.name)) {
      throw new Error(`Duplicate field name: ${field.name}`);
    }
    names.add(field.name);
    if (typeof field.type !== 'string' || !TYPES.has(field.type.toLowerCase())) {
      throw new Error(`Unsupported type for field "${field.name}"`);
    }
    for (const property of ['required', 'unique']) {
      if (field[property] !== undefined && typeof field[property] !== 'boolean') {
        throw new Error(`Field "${field.name}" ${property} must be boolean`);
      }
    }
    return {
      name: field.name,
      type: field.type.toLowerCase(),
      required: field.required === true,
      unique: field.unique === true,
    };
  });

  let ownerField = input.ownerField;
  if (ownerField !== undefined) {
    validateIdentifier(ownerField, 'ownerField');
    if (!names.has(ownerField)) {
      fields.push({ name: ownerField, type: 'string', required: false, unique: false });
    }
  }

  if (input.rbac !== undefined) {
    if (!input.rbac || typeof input.rbac !== 'object' || Array.isArray(input.rbac)) {
      throw new Error('Model "rbac" must be an object');
    }
    for (const [role, permissions] of Object.entries(input.rbac)) {
      if (
        !Array.isArray(permissions) ||
        permissions.some((permission) => !OPERATIONS.has(permission))
      ) {
        throw new Error(`Invalid permissions for role "${role}"`);
      }
    }
  }

  return {
    ...input,
    name: input.name.trim(),
    tableName,
    fields,
    ...(ownerField === undefined ? {} : { ownerField }),
  };
}

function coerceAndValidateRecord(model, input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Record must be an object');
  }
  const fields = new Map(model.fields.map((field) => [field.name, field]));
  for (const key of Object.keys(input)) {
    if (!fields.has(key)) {
      throw new Error(`Unknown field: ${key}`);
    }
  }
  const values = {};
  for (const field of model.fields) {
    if (!Object.prototype.hasOwnProperty.call(input, field.name)) {
      if (field.required && !partial) {
        throw new Error(`Field "${field.name}" is required`);
      }
      continue;
    }
    const value = input[field.name];
    if (value === null || value === undefined) {
      if (field.required && !partial) {
        throw new Error(`Field "${field.name}" is required`);
      }
      values[field.name] = null;
      continue;
    }
    if (['string', 'text', 'relation'].includes(field.type) && typeof value !== 'string') {
      throw new Error(`Field "${field.name}" must be a string`);
    }
    if (
      ['number', 'float'].includes(field.type) &&
      (typeof value !== 'number' || !Number.isFinite(value))
    ) {
      throw new Error(`Field "${field.name}" must be a number`);
    }
    if (['integer', 'autoincrement'].includes(field.type) && !Number.isInteger(value)) {
      throw new Error(`Field "${field.name}" must be an integer`);
    }
    if (field.type === 'boolean' && typeof value !== 'boolean' && value !== 0 && value !== 1) {
      throw new Error(`Field "${field.name}" must be a boolean`);
    }
    values[field.name] =
      field.type === 'boolean' ? (value === true ? 1 : value === false ? 0 : value) : value;
  }
  return values;
}

module.exports = { validateModel, coerceAndValidateRecord };
