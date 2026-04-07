import { createApp } from './app';
import { config } from './config';
import { pool } from './db/pool';

async function main() {
  await pool.query('SELECT 1');
  console.log('DB connected');

  const app = createApp();

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Server started on port ${config.port}`);
  });
}

main().catch((err) => {
  console.error('Server start error:\n', err);
  process.exit(1);
});
