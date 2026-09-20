const { quoteIdentifier } = require('./identifiers');

function sqliteType(type) {
  if (['number', 'float'].includes(type)) return 'REAL';
  if (['integer', 'autoincrement', 'boolean'].includes(type)) return 'INTEGER';
  return 'TEXT';
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function callback(err) {
      if (err) reject(err);
      else resolve(this);
    }),
  );
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))),
  );
}

async function reconcileSchema(db, model) {
  const table = quoteIdentifier(model.tableName, 'tableName');
  const existing = await all(db, `PRAGMA table_info(${table})`);
  if (!existing.length) {
    const definitions = [`"id" INTEGER PRIMARY KEY AUTOINCREMENT`];
    for (const field of model.fields) {
      definitions.push(
        `${quoteIdentifier(field.name, 'field name')} ${sqliteType(field.type)}${field.required ? ' NOT NULL' : ''}${field.unique ? ' UNIQUE' : ''}`,
      );
    }
    await run(db, `CREATE TABLE ${table} (${definitions.join(', ')})`);
    return;
  }
  const columns = new Set(existing.map((column) => column.name));
  for (const field of model.fields) {
    if (!columns.has(field.name)) {
      if (field.required) {
        throw new Error(`Cannot add required field "${field.name}" to table with existing records`);
      }
      await run(
        db,
        `ALTER TABLE ${table} ADD COLUMN ${quoteIdentifier(field.name, 'field name')} ${sqliteType(field.type)}`,
      );
    }
  }
  const indexes = await all(db, `PRAGMA index_list(${table})`);
  for (const field of model.fields.filter((item) => item.unique)) {
    const uniqueIndex = indexes.find((index) => index.unique && index.name.includes(field.name));
    if (!uniqueIndex) {
      await run(
        db,
        `CREATE UNIQUE INDEX ${quoteIdentifier(`${model.tableName}_${field.name}_unique`, 'index name')} ON ${table} (${quoteIdentifier(field.name, 'field name')})`,
      );
    }
  }
}

module.exports = { reconcileSchema, run, all };
