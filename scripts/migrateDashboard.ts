#!/usr/bin/env tsx
/**
 * Dashboard Migration Script
 * Adds rejected/hired columns and backfills existing data.
 * Run with: tsx scripts/migrateDashboard.ts
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

const DATA_DIR = join(process.cwd(), 'data');
const DB_PATH = process.env.JOB_DATA_DB_PATH || join(DATA_DIR, 'jobdata.db');

function ensureDirectory(dirPath: string): void {
  try {
    mkdirSync(dirPath, { recursive: true });
  } catch {
    // Directory exists or permission error - ignore
  }
}

function main(): void {
  ensureDirectory(DATA_DIR);
  const dbDir = dirname(DB_PATH);
  if (dbDir !== DATA_DIR) {
    ensureDirectory(dbDir);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  console.log('[Migration] Starting dashboard migration...');

  // 1. Add site, jobDescription, isCollectionUrl columns to scraping_results
  console.log('[Migration] Adding columns to scraping_results...');
  for (const col of ['site TEXT', 'jobDescription TEXT', 'isCollectionUrl INTEGER DEFAULT 0']) {
    try {
      db.exec(`ALTER TABLE scraping_results ADD COLUMN ${col}`);
      console.log(`  Added ${col.split(' ')[0]}`);
    } catch {
      console.log(`  ${col.split(' ')[0]} already exists`);
    }
  }

  // 2. Add site, jobDescription, isCollectionUrl columns to saved_jobs
  console.log('[Migration] Adding columns to saved_jobs...');
  for (const col of ['site TEXT', 'jobDescription TEXT', 'isCollectionUrl INTEGER DEFAULT 0']) {
    try {
      db.exec(`ALTER TABLE saved_jobs ADD COLUMN ${col}`);
      console.log(`  Added ${col.split(' ')[0]}`);
    } catch {
      console.log(`  ${col.split(' ')[0]} already exists`);
    }
  }

  // 3. Add site, jobDescription columns to job_dashboard
  console.log('[Migration] Adding columns to job_dashboard...');
  for (const col of ['site TEXT', 'jobDescription TEXT']) {
    try {
      db.exec(`ALTER TABLE job_dashboard ADD COLUMN ${col}`);
      console.log(`  Added ${col.split(' ')[0]}`);
    } catch {
      console.log(`  ${col.split(' ')[0]} already exists`);
    }
  }

  // 4. Backfill status for existing dashboard jobs
  console.log('[Migration] Backfilling status/column mapping...');
  const rows = db.prepare('SELECT rowid, url, status, column FROM job_dashboard').all() as Array<{
    rowid: number;
    url: string;
    status: string | null;
    column: string | null;
  }>;

  const STATUS_TO_LIST: Record<string, string> = {
    'No News': 'applied',
    'Interviewing': 'screening',
    'Rejected': 'rejected',
    'Offer': 'offer',
    'Hired': 'hired',
  };

  const updateStmt = db.prepare('UPDATE job_dashboard SET status = ?, column = ? WHERE rowid = ?');
  let updated = 0;
  for (const row of rows) {
    let status = row.status || 'No News';
    let column = row.column;

    // Fix the Rejected -> 'hired' bug
    if (status === 'Rejected' && column === 'hired') {
      column = 'rejected';
      console.log(`  Fixed Rejected mapping for ${row.url}`);
    }

    if (!column) {
      column = STATUS_TO_LIST[status] || 'applied';
    }

    if (status !== 'No News' && status !== 'Interviewing' && status !== 'Offer' && status !== 'Rejected' && status !== 'Hired') {
      status = 'No News';
      column = 'applied';
    }

    updateStmt.run(status, column, row.rowid);
    updated++;
  }
  console.log(`  Updated ${updated} dashboard jobs`);

  // 5. Ensure jobId exists for all dashboard jobs
  console.log('[Migration] Generating jobIds for missing rows...');
  const jobIdStmt = db.prepare('UPDATE job_dashboard SET jobId = ? WHERE rowid = ? AND (jobId IS NULL OR jobId = \'\')');
  let jobIdCount = 0;
  for (const row of rows) {
    if (!row.url) {
      const jobId = 'manual-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      jobIdStmt.run(jobId, row.rowid);
      jobIdCount++;
    }
  }
  console.log(`  Generated ${jobIdCount} jobIds`);

  db.close();
  console.log('[Migration] Dashboard migration completed successfully!');
}

main();