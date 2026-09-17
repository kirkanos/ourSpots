import { v7 as uuidv7 } from 'uuid';

/**
 * UUIDv7 ist zeitsortiert: Primaerschluessel bleiben in InnoDB weitgehend
 * append-only, und Listen sind ohne zusaetzlichen Sortierschluessel stabil.
 */
export function newId(): string {
  return uuidv7();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
