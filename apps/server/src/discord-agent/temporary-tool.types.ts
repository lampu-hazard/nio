import * as util from 'util';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SnapshotCapability =
  | 'get_server_channels'
  | 'get_server_roles'
  | 'get_channel_info'
  | 'get_voice_state';

export type RequestIdentity = Readonly<{
  runId: string;
  guildId: string;
  channelId: string;
  requestedById: string;
}>;

export type TemporaryToolCall = {
  jobId?: string;
  label: string;
  purpose: string;
  source: string;
  snapshotRefs: string[];
  parameters: JsonValue;
  tests: { input: JsonValue; expected: JsonValue }[];
};

export type SandboxRequest = {
  source: string;
  tests: TemporaryToolCall['tests'];
  input: JsonValue;
};

export type SandboxResult = {
  value: JsonValue;
  passedTests: number;
  durationMs: number;
};

export type TemporaryToolAudit = {
  phase: 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  jobId: string;
  label: string;
  purpose: string;
  sourceHash: string;
  capabilities: SnapshotCapability[];
  snapshotCount: number;
  snapshotBytes: number;
  passedTests: number;
  durationMs: number;
  outcome: string;
};

export const SNAPSHOT_CAPABILITIES: readonly SnapshotCapability[] = [
  'get_server_channels',
  'get_server_roles',
  'get_channel_info',
  'get_voice_state',
] as const;

export const TEMPORARY_TOOL_ERROR_CODES = [
  'INVALID_INPUT',
  'SNAPSHOT_FORBIDDEN',
  'TEST_FAILED',
  'RESOURCE_LIMIT',
  'CAPACITY_EXCEEDED',
  'RUN_CANCELLED',
  'RUNNER_UNAVAILABLE',
  'EXECUTION_FAILED',
] as const;

export type TemporaryToolErrorCode = (typeof TEMPORARY_TOOL_ERROR_CODES)[number];

export class TemporaryToolError extends Error {
  readonly code: TemporaryToolErrorCode;

  constructor(code: TemporaryToolErrorCode, message = code) {
    super(message);
    this.name = 'TemporaryToolError';
    this.code = code;
  }
}

export const MAX_JOBS_PER_RUN = 2;
export const MAX_ATTEMPTS_PER_JOB = 3;
export const MAX_INVOCATIONS_PER_RUN = 6;
export const MAX_ACTIVE_PER_RUN = 1;
export const MAX_ACTIVE_CHILDREN = 2;

export const MAX_SOURCE_BYTES = 16 * 1024;
export const MAX_INPUT_BYTES = 128 * 1024;
export const MAX_SNAPSHOT_REGISTRY_BYTES = 128 * 1024;
export const MAX_TESTS_BYTES = 32 * 1024;
export const MAX_IPC_OUTPUT_BYTES = 32 * 1024;
export const MAX_STDERR_BYTES = 4 * 1024;
export const MAX_JSON_DEPTH = 20;
export const MIN_TESTS_COUNT = 1;
export const MAX_TESTS_COUNT = 5;
export const MAX_LABEL_LENGTH = 80;
export const MAX_PURPOSE_LENGTH = 240;

export const QUICKJS_MEMORY_LIMIT_BYTES = 16 * 1024 * 1024;
export const QUICKJS_MAX_STACK_BYTES = 512 * 1024;
export const TEST_INTERRUPT_MS = 500;
export const LIVE_INTERRUPT_MS = 2_000;
export const CHILD_HARD_TIMEOUT_MS = 5_000;
export const RUN_WALL_CLOCK_MS = 20_000;

const BANNED_METADATA_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const ALLOWED_CALL_KEYS = new Set([
  'jobId',
  'label',
  'purpose',
  'source',
  'snapshotRefs',
  'parameters',
  'tests',
]);
const ALLOWED_TEST_KEYS = new Set(['input', 'expected']);
const ALLOWED_SANDBOX_REQUEST_KEYS = new Set(['source', 'tests', 'input']);

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function invalidInput(): never {
  throw new TemporaryToolError('INVALID_INPUT', 'INVALID_INPUT');
}

function assertPlainRecord(
  value: unknown,
  allowedKeys?: ReadonlySet<string>,
  requiredKeys?: ReadonlySet<string>,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || util.types.isProxy(value)) {
    invalidInput();
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    invalidInput();
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    invalidInput();
  }
  const keys = Object.getOwnPropertyNames(value);
  const keySet = new Set<string>();
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (BANNED_METADATA_KEYS.has(key)) {
      invalidInput();
    }
    if (allowedKeys && !allowedKeys.has(key)) {
      invalidInput();
    }
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if (!desc || !desc.enumerable || !('value' in desc) || desc.get !== undefined || desc.set !== undefined) {
      invalidInput();
    }
    keySet.add(key);
    out[key] = desc.value;
  }
  if (requiredKeys) {
    for (const reqKey of requiredKeys) {
      if (!keySet.has(reqKey)) {
        invalidInput();
      }
    }
  }
  return out;
}

function assertPlainArray(value: unknown): unknown[] {
  if (!Array.isArray(value) || util.types.isProxy(value)) {
    invalidInput();
  }
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    invalidInput();
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    invalidInput();
  }
  const ownNames = Object.getOwnPropertyNames(value);
  if (ownNames.length !== value.length + 1) {
    invalidInput();
  }
  const out: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const desc = Object.getOwnPropertyDescriptor(value, i);
    if (!desc || !desc.enumerable || !('value' in desc) || desc.get !== undefined || desc.set !== undefined) {
      invalidInput();
    }
    out.push(desc.value);
  }
  return out;
}

export function validateJson(value: unknown, maxBytes: number): JsonValue {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) {
    invalidInput();
  }
  const seen = new Set<object>();
  let bytes = 0;

  const addBytes = (count: number): void => {
    bytes += count;
    if (bytes > maxBytes) {
      invalidInput();
    }
  };

  const walk = (current: unknown, depth: number): JsonValue => {
    if (current === null) {
      addBytes(4);
      return null;
    }
    const kind = typeof current;
    if (kind === 'boolean') {
      addBytes(current ? 4 : 5);
      return current as boolean;
    }
    if (kind === 'number') {
      if (!Number.isFinite(current as number)) {
        invalidInput();
      }
      const normalized = (current as number) === 0 ? 0 : (current as number);
      addBytes(Buffer.byteLength(JSON.stringify(normalized), 'utf8'));
      return normalized;
    }
    if (kind === 'string') {
      addBytes(Buffer.byteLength(JSON.stringify(current), 'utf8'));
      return current as string;
    }
    if (kind !== 'object') {
      invalidInput();
    }

    const obj = current as object;
    if (util.types.isProxy(obj) || seen.has(obj) || depth >= MAX_JSON_DEPTH) {
      invalidInput();
    }

    if (Array.isArray(obj)) {
      const elements = assertPlainArray(obj);
      addBytes(2);
      seen.add(obj);
      const clonedArr: JsonValue[] = [];
      for (let i = 0; i < elements.length; i++) {
        if (i > 0) {
          addBytes(1);
        }
        clonedArr.push(walk(elements[i], depth + 1));
      }
      seen.delete(obj);
      return clonedArr;
    }

    const record = assertPlainRecord(obj);
    const keys = Object.keys(record);
    addBytes(2);
    seen.add(obj);
    const clonedObj: { [key: string]: JsonValue } = {};
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (i > 0) {
        addBytes(1);
      }
      addBytes(Buffer.byteLength(JSON.stringify(key), 'utf8') + 1);
      const childVal = walk(record[key], depth + 1);
      Object.defineProperty(clonedObj, key, {
        value: childVal,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    seen.delete(obj);
    return clonedObj;
  };

  try {
    const detached = walk(value, 0);
    if (utf8ByteLength(JSON.stringify(detached)) > maxBytes) {
      invalidInput();
    }
    return detached;
  } catch (err) {
    if (err instanceof TemporaryToolError) {
      throw err;
    }
    invalidInput();
  }
}

export function jsonEquals(left: JsonValue, right: JsonValue): boolean {
  if (left === right) {
    return true;
  }
  if (typeof left !== typeof right || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    for (let i = 0; i < left.length; i++) {
      if (!jsonEquals(left[i], right[i])) {
        return false;
      }
    }
    return true;
  }
  if (typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) {
        return false;
      }
      if (!jsonEquals((left as Record<string, JsonValue>)[key], (right as Record<string, JsonValue>)[key])) {
        return false;
      }
    }
    return true;
  }
  return false;
}

function validateSourceString(source: unknown): string {
  if (typeof source !== 'string' || source.trim().length === 0) {
    invalidInput();
  }
  if (utf8ByteLength(source) > MAX_SOURCE_BYTES) {
    invalidInput();
  }
  return source;
}

function validateTestsArray(rawTests: unknown): TemporaryToolCall['tests'] {
  const items = assertPlainArray(rawTests);
  if (items.length < MIN_TESTS_COUNT || items.length > MAX_TESTS_COUNT) {
    invalidInput();
  }
  const normalized: TemporaryToolCall['tests'] = [];
  for (const item of items) {
    const rec = assertPlainRecord(item, ALLOWED_TEST_KEYS, ALLOWED_TEST_KEYS);
    normalized.push({
      input: validateJson(rec.input, MAX_TESTS_BYTES),
      expected: validateJson(rec.expected, MAX_TESTS_BYTES),
    });
  }
  if (utf8ByteLength(JSON.stringify(normalized)) > MAX_TESTS_BYTES) {
    invalidInput();
  }
  return normalized;
}

export function parseTemporaryToolCall(value: unknown): TemporaryToolCall {
  try {
    const rec = assertPlainRecord(
      value,
      ALLOWED_CALL_KEYS,
      new Set(['label', 'purpose', 'source', 'snapshotRefs', 'parameters', 'tests']),
    );

    let jobId: string | undefined;
    if (rec.jobId !== undefined) {
      if (
        typeof rec.jobId !== 'string' ||
        rec.jobId.trim().length === 0 ||
        rec.jobId.length > 120 ||
        BANNED_METADATA_KEYS.has(rec.jobId)
      ) {
        invalidInput();
      }
      jobId = rec.jobId;
    }

    if (
      typeof rec.label !== 'string' ||
      rec.label.trim().length === 0 ||
      rec.label.length > MAX_LABEL_LENGTH ||
      BANNED_METADATA_KEYS.has(rec.label)
    ) {
      invalidInput();
    }

    if (
      typeof rec.purpose !== 'string' ||
      rec.purpose.trim().length === 0 ||
      rec.purpose.length > MAX_PURPOSE_LENGTH
    ) {
      invalidInput();
    }

    const source = validateSourceString(rec.source);

    const rawRefs = assertPlainArray(rec.snapshotRefs);
    const seenRefs = new Set<string>();
    const snapshotRefs: string[] = [];
    for (const ref of rawRefs) {
      if (
        typeof ref !== 'string' ||
        ref.trim().length === 0 ||
        ref.length > 120 ||
        BANNED_METADATA_KEYS.has(ref) ||
        seenRefs.has(ref)
      ) {
        invalidInput();
      }
      seenRefs.add(ref);
      snapshotRefs.push(ref);
    }

    const parameters = validateJson(rec.parameters, MAX_INPUT_BYTES);
    const tests = validateTestsArray(rec.tests);

    return {
      ...(jobId !== undefined ? { jobId } : {}),
      label: rec.label,
      purpose: rec.purpose,
      source,
      snapshotRefs,
      parameters,
      tests,
    };
  } catch (err) {
    if (err instanceof TemporaryToolError) {
      throw err;
    }
    invalidInput();
  }
}

export function validateSandboxRequest(value: unknown): SandboxRequest {
  try {
    const rec = assertPlainRecord(
      value,
      ALLOWED_SANDBOX_REQUEST_KEYS,
      ALLOWED_SANDBOX_REQUEST_KEYS,
    );
    return {
      source: validateSourceString(rec.source),
      tests: validateTestsArray(rec.tests),
      input: validateJson(rec.input, MAX_INPUT_BYTES),
    };
  } catch (err) {
    if (err instanceof TemporaryToolError) {
      throw err;
    }
    invalidInput();
  }
}