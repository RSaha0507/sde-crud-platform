const { createApp } = require('./src/app');

const instance = createApp();
const { app, config } = instance;
const server = app.listen(config.PORT, () => {
  console.log(`\n[System] Backend server running on http://localhost:${config.PORT}`);
  console.log(`[System] Models directory: ${config.MODELS_DIR}`);
  console.log(`[System] Database file: ${config.DB_FILE}`);
  console.log(
    `\n[Test] Try POSTing a model to http://localhost:${config.PORT}/admin/api/models/publish`,
  );
  console.log(`[Test] Test RBAC with 'X-User-Role: Viewer' (or Manager, Admin) header`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ event: 'shutdown_started', signal }));
  server.close(async (error) => {
    if (error) {
      console.error(JSON.stringify({ event: 'shutdown_error', message: error.message }));
      process.exitCode = 1;
    }
    try {
      await instance.close();
    } catch (closeError) {
      console.error(JSON.stringify({ event: 'database_close_error', message: closeError.message }));
      process.exitCode = 1;
    }
    process.exit();
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
