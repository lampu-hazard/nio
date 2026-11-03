import { describe, expect, test } from '@jest/globals';
import {
  MAX_INPUT_BYTES,
  MAX_SOURCE_BYTES,
  MAX_TESTS_BYTES,
  TemporaryToolError,
  jsonEquals,
  parseTemporaryToolCall,
  utf8ByteLength,
  validateJson,
} from './temporary-tool.types';

describe('temporary-tool.types', () => {
  test('rejects_non_json_and_depth_21', () => {
    const source = { nested: [1, 'ok', true, null] };
    const cloned = validateJson(source, MAX_INPUT_BYTES) as { nested: unknown[] };
    expect(cloned).toEqual({ nested: [1, 'ok', true, null] });
    expect(cloned).not.toBe(source);
    source.nested.push('mutated');
    expect(cloned.nested).toHaveLength(4);

    let depth20Obj: unknown = 'leaf';
    let depth20Arr: unknown = 'leaf';
    for (let i = 0; i < 20; i++) {
      depth20Obj = { a: depth20Obj };
      depth20Arr = [depth20Arr];
    }
    expect(validateJson(depth20Obj, MAX_INPUT_BYTES)).toEqual(depth20Obj);
    expect(validateJson(depth20Arr, MAX_INPUT_BYTES)).toEqual(depth20Arr);

    const depth21Obj = { a: depth20Obj };
    const depth21Arr = [depth20Arr];
    expect(() => validateJson(depth21Obj, MAX_INPUT_BYTES)).toThrow(TemporaryToolError);
    expect(() => validateJson(depth21Arr, MAX_INPUT_BYTES)).toThrow(TemporaryToolError);

    const cyclicObj: Record<string, unknown> = { a: 1 };
    cyclicObj.self = cyclicObj;
    const cyclicArr: unknown[] = [];
    cyclicArr.push(cyclicArr);

    // eslint-disable-next-line no-sparse-arrays
    const sparseArray = [1, , 3];
    const getterObject = {};
    Object.defineProperty(getterObject, 'a', {
      enumerable: true,
      get() {
        return 1;
      },
    });
    const proxyObject = new Proxy({ a: 1 }, {});
    const throwingProxy = new Proxy(
      { a: 1 },
      {
        ownKeys() {
          throw new Error('proxy trap');
        },
      },
    );
    const protoKeyObj = Object.create(null) as Record<string, unknown>;
    protoKeyObj['__proto__'] = { polluted: true };

    const invalidValues: unknown[] = [
      Promise.resolve(1),
      () => 1,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      BigInt(1),
      Symbol('x'),
      sparseArray,
      cyclicObj,
      cyclicArr,
      getterObject,
      proxyObject,
      throwingProxy,
      new Date(),
      new Map(),
      new Set(),
      /pattern/,
      protoKeyObj,
      { prototype: 1 },
      { constructor: 1 },
    ];

    for (const invalid of invalidValues) {
      expect(() => validateJson(invalid, MAX_INPUT_BYTES)).toThrow(
        expect.objectContaining({
          name: 'TemporaryToolError',
          code: 'INVALID_INPUT',
        }),
      );
    }

    const baseCall = {
      label: 'group-channels',
      purpose: 'Group visible channels by category',
      source: 'function run(input) { return input; }',
      snapshotRefs: ['snap_1', 'snap_2'],
      parameters: depth20Obj,
      tests: [{ input: { snapshots: [], parameters: null }, expected: { General: ['a', 'b'] } }],
    };
    expect(parseTemporaryToolCall(baseCall)).toMatchObject({
      label: 'group-channels',
      snapshotRefs: ['snap_1', 'snap_2'],
    });

    expect(() =>
      parseTemporaryToolCall({
        ...baseCall,
        snapshotRefs: ['snap_1', 'snap_1'],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));

    expect(() =>
      parseTemporaryToolCall({
        ...baseCall,
        guildId: 'spoofed-guild',
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));

    expect(() =>
      parseTemporaryToolCall({
        ...baseCall,
        parameters: depth21Obj,
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });

  test('counts_utf8_not_characters', () => {
    const emoji = '🦀'; // 4 UTF-8 bytes, 2 UTF-16 code units
    expect(emoji.length).toBe(2);
    expect(utf8ByteLength(emoji)).toBe(4);

    // JSON string of 250 crabs is 250 * 4 + 2 quotes = 1002 UTF-8 bytes, but only 500 UTF-16 chars
    const crabs = emoji.repeat(250);
    expect(crabs.length).toBe(500);
    expect(validateJson(crabs, 1002)).toBe(crabs);
    expect(() => validateJson(crabs, 1001)).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );

    // Source limit: 16 KiB (16384 UTF-8 bytes) accepted, +1 rejected
    const exactAsciiSource = 'a'.repeat(MAX_SOURCE_BYTES);
    const overAsciiSource = 'a'.repeat(MAX_SOURCE_BYTES + 1);
    // 4096 crabs = 8192 UTF-16 code units (< 16384), 16384 UTF-8 bytes
    const exactUtf8Source = emoji.repeat(MAX_SOURCE_BYTES / 4);
    // 4096 crabs + 'a' = 8193 UTF-16 code units (< 16384), 16385 UTF-8 bytes (> 16384)
    const overUtf8Source = exactUtf8Source + 'a';

    const makeCall = (source: string, tests: { input: null; expected: string }[]) => ({
      label: 'utf8-check',
      purpose: 'Check UTF-8 byte limits',
      source,
      snapshotRefs: ['snap_1'],
      parameters: null,
      tests,
    });

    const smallTests = [{ input: null, expected: 'ok' }];
    expect(parseTemporaryToolCall(makeCall(exactAsciiSource, smallTests)).source).toBe(
      exactAsciiSource,
    );
    expect(() => parseTemporaryToolCall(makeCall(overAsciiSource, smallTests))).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
    expect(parseTemporaryToolCall(makeCall(exactUtf8Source, smallTests)).source).toBe(
      exactUtf8Source,
    );
    expect(() => parseTemporaryToolCall(makeCall(overUtf8Source, smallTests))).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );

    // Tests limit: 32 KiB (32768 UTF-8 bytes) accepted, +1 rejected
    const testFramingBytes = Buffer.byteLength('[{"input":null,"expected":""}]', 'utf8');
    const remainingForExpected = MAX_TESTS_BYTES - testFramingBytes;
    const exactTests = [{ input: null, expected: 'x'.repeat(remainingForExpected) }];
    const overTests = [{ input: null, expected: 'x'.repeat(remainingForExpected + 1) }];
    expect(Buffer.byteLength(JSON.stringify(exactTests), 'utf8')).toBe(MAX_TESTS_BYTES);
    expect(Buffer.byteLength(JSON.stringify(overTests), 'utf8')).toBe(MAX_TESTS_BYTES + 1);

    expect(parseTemporaryToolCall(makeCall('function run(){}', exactTests)).tests).toHaveLength(1);
    expect(() => parseTemporaryToolCall(makeCall('function run(){}', overTests))).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );

    // Multi-byte UTF-8 in tests: character count well under 32 KiB, UTF-8 bytes over 32 KiB
    const multiByteOverTests = [{ input: null, expected: emoji.repeat(8200) }];
    expect(multiByteOverTests[0].expected.length).toBeLessThan(MAX_TESTS_BYTES);
    expect(() =>
      parseTemporaryToolCall(makeCall('function run(){}', multiByteOverTests)),
    ).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));

    // Structural equality ignores object key order but preserves array order
    expect(
      jsonEquals(
        { General: ['a', 'b'], Voice: ['c'] },
        { Voice: ['c'], General: ['a', 'b'] },
      ),
    ).toBe(true);
    expect(jsonEquals({ General: ['a', 'b'] }, { General: ['b', 'a'] })).toBe(false);
  });
});