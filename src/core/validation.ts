import { errors } from './errors.js';

export type Rule = (value: unknown, name: string) => string | null;

export const rules = {
  required: (value: unknown, name: string) => (value === undefined || value === null || value === '' ? `${name} is required` : null),
  string: (value: unknown, name: string) => (typeof value !== 'string' ? `${name} must be a string` : null),
  number: (value: unknown, name: string) => (typeof value !== 'number' || !Number.isFinite(value) ? `${name} must be a number` : null),
  integer: (value: unknown, name: string) => (!Number.isInteger(value) ? `${name} must be a whole number` : null),
  positive: (value: unknown, name: string) => (typeof value === 'number' && value > 0 ? null : `${name} must be greater than zero`),
  nonNegative: (value: unknown, name: string) => (typeof value === 'number' && value >= 0 ? null : `${name} cannot be negative`),
  email: (value: unknown, name: string) => (typeof value === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? null : `${name} must be a valid email address`),
  oneOf: (...options: unknown[]) => (value: unknown, name: string) => (options.includes(value) ? null : `${name} must be one of: ${options.join(', ')}`),
  minLength: (n: number) => (value: unknown, name: string) => (typeof value === 'string' && value.length >= n ? null : `${name} must be at least ${n} characters`),
  array: (value: unknown, name: string) => (Array.isArray(value) ? null : `${name} must be an array`),
  boolean: (value: unknown, name: string) => (typeof value === 'boolean' ? null : `${name} must be true or false`)
};

export type Schema = Record<string, Rule[]>;

export function validate(schema: Schema, data: Record<string, unknown>): Record<string, unknown> {
  const problems: string[] = [];
  for (const [field, fieldRules] of Object.entries(schema)) {
    for (const rule of fieldRules) {
      const problem = rule(data[field], field);
      if (problem) {
        problems.push(problem);
        break;
      }
    }
  }
  if (problems.length) throw errors.badRequest('Please correct the highlighted fields', problems);
  return data;
}

export function parseNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function cleanString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}
