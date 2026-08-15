import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';

const TEST_DB_PATH = join(__dirname, '..', 'data', 'test', 'jobdata-test.db');

export default async function globalTeardown(): Promise<void> {
  // Clean up test database after all tests
  const files = [
    TEST_DB_PATH,
    TEST_DB_PATH + '-wal',
    TEST_DB_PATH + '-shm',
  ];
  
  for (const file of files) {
    if (existsSync(file)) {
      try {
        rmSync(file, { force: true, retryDelay: 200, maxRetries: 5 });
      } catch {
        // Ignore - file may be locked by server process on Windows
      }
    }
  }
  
  // Also clean up the unit test DB path used by server-endpoints.test.ts
  const UNIT_TEST_DB = join(__dirname, '..', 'data', 'test', 'jobdata-unit-test.db');
  const unitTestFiles = [
    UNIT_TEST_DB,
    UNIT_TEST_DB + '-wal',
    UNIT_TEST_DB + '-shm',
  ];
  for (const file of unitTestFiles) {
    if (existsSync(file)) {
      try {
        rmSync(file, { force: true, retryDelay: 200, maxRetries: 5 });
      } catch {
        // Ignore
      }
    }
  }
}