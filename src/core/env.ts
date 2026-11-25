/** Dependency-free .env loader.
 *
 * Runtime entry points import this module first so real secrets can live in a
 * gitignored .env file instead of being baked into source or committed. Values
 * already present in the process environment always win; ENV_FILE can point to
 * a different file (for example a mounted Docker secret).
 */

import fs from 'node:fs';
import path from 'node:path';

export function loadEnv(options: { path?: string; override?: boolean } = {}): string[] {
  if (process.env.NEXORA_SKIP_DOTENV === '1') return [];

  const file = path.resolve(process.cwd(), options.path || process.env.ENV_FILE || '.env');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return [];

  const loaded: string[] = [];
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const declaration = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separator = declaration.indexOf('=');
    if (separator <= 0) continue;

    const key = declaration.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = declaration.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');

    if (!options.override && process.env[key] !== undefined) continue;
    process.env[key] = value;
    loaded.push(key);
  }
  return loaded;
}

loadEnv();
