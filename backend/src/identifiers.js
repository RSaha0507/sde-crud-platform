const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function validateIdentifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${label} must be a safe SQL identifier`);
  }
  return value;
}

function quoteIdentifier(value, label = 'Identifier') {
  return `"${validateIdentifier(value, label)}"`;
}

module.exports = { validateIdentifier, quoteIdentifier };
