import { spawn } from 'node:child_process';
import path from 'node:path';
import { logger } from './logger.js';

let running = false;

/** Run the same backup helper exposed by `npm run backup`. The scheduler and
 * the manual command therefore produce identical artifacts. */
export async function runBackupNow(): Promise<boolean> {
  if (running) {
    logger.warn('Backup already running; skipping scheduled run');
    return false;
  }
  running = true;
  const script = path.resolve(process.cwd(), 'scripts/backup.sh');
  try {
    const result = await new Promise<{ code: number | null; output: string }>((resolve) => {
      const child = spawn('bash', [script], { cwd: process.cwd(), env: process.env });
      let output = '';
      child.stdout.on('data', (chunk) => { output += String(chunk); });
      child.stderr.on('data', (chunk) => { output += String(chunk); });
      child.on('error', (error) => resolve({ code: 1, output: `${output}\n${error.message}` }));
      child.on('close', (code) => resolve({ code, output }));
    });
    if (result.code === 0) {
      logger.info('Scheduled backup completed');
      return true;
    }
    logger.error('Scheduled backup failed', { exitCode: result.code, output: result.output.slice(-2000) });
    return false;
  } finally {
    running = false;
  }
}

/** Production backup scheduler. Set BACKUP_INTERVAL_HOURS=0 to disable. */
export function startBackupScheduler(): () => void {
  const hours = Number(process.env.BACKUP_INTERVAL_HOURS || 24);
  if (!Number.isFinite(hours) || hours <= 0) {
    logger.info('Scheduled backups disabled');
    return () => undefined;
  }
  const timer = setInterval(() => { void runBackupNow(); }, hours * 60 * 60 * 1000);
  timer.unref();
  logger.info('Backup scheduler started', { intervalHours: hours });
  return () => clearInterval(timer);
}
