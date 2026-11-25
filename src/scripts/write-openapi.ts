import '../core/env.js';
import fs from 'node:fs';
import path from 'node:path';
import { openApiDocument } from '../api/openapi.js';

const target = process.argv[2] || path.resolve(process.cwd(), 'docs/openapi.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(openApiDocument(), null, 2)}\n`, 'utf8');
console.log(`[Nexora] OpenAPI document written to ${target}`);
