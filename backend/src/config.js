const path = require('path');
require('dotenv').config();

function getConfig(overrides = {}) {
  const trustProxy = overrides.TRUST_PROXY || process.env.TRUST_PROXY || false;
  return {
    PORT: Number(overrides.PORT || process.env.PORT || 4000),
    DB_FILE: overrides.DB_FILE || process.env.DB_FILE || path.join(__dirname, '..', 'data.db'),
    MODELS_DIR:
      overrides.MODELS_DIR || process.env.MODELS_DIR || path.join(__dirname, '..', 'models-json'),
    CORS_ORIGIN: overrides.CORS_ORIGIN || process.env.CORS_ORIGIN || 'http://localhost:5173',
    BODY_LIMIT: overrides.BODY_LIMIT || process.env.BODY_LIMIT || '100kb',
    RATE_LIMIT_WINDOW_MS: Number(
      overrides.RATE_LIMIT_WINDOW_MS || process.env.RATE_LIMIT_WINDOW_MS || 900000,
    ),
    RATE_LIMIT_MAX: Number(overrides.RATE_LIMIT_MAX || process.env.RATE_LIMIT_MAX || 100),
    TRUST_PROXY: trustProxy === true || trustProxy === 'true' ? true : trustProxy,
  };
}

module.exports = { getConfig };
