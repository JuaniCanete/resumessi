import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';

const TEST_DB_PATH = join(__dirname, '..', 'data', 'jobdata-test.db');

export default async function globalTeardown(): Promise<void> {
  // Clean up test database after all tests
  // Note: Server may still hold locks on Windows, so we ignore errors
  const files = [
    TEST_DB_PATH,
    TEST_DB_PATH + '-wal',
    TEST_DB_PATH + '-shm',
  ];
  
  for (const file of files) {
    if (existsSync(file)) {
      try {
        rmSync(file, { force: true });
      } catch {
        // Ignore - file may be locked by server process on Windows
      }
    }
  }
}