import { performance } from 'perf_hooks';
import {
  getQuickJS,
  QuickJSContext,
  QuickJSHandle,
  QuickJSRuntime,
  QuickJSWASMModule,
} from 'quickjs-emscripten';
import {
  JsonValue,
  LIVE_INTERRUPT_MS,
  MAX_INPUT_BYTES,
  MAX_IPC_OUTPUT_BYTES,
  MAX_SOURCE_BYTES,
  MAX_TESTS_BYTES,
  QUICKJS_MAX_STACK_BYTES,
  QUICKJS_MEMORY_LIMIT_BYTES,
  TEST_INTERRUPT_MS,
  TemporaryToolCall,
  TemporaryToolError,
  TemporaryToolErrorCode,
  jsonEquals,
  parseTemporaryToolCall,
  utf8ByteLength,
  validateJson,
} from './temporary-tool.types';

const MAX_STDIN_ENVELOPE_BYTES =
  MAX_SOURCE_BYTES * 6 + MAX_TESTS_BYTES + MAX_INPUT_BYTES + 4096;

// ponytail: in-guest walker caps at depth 20 and 32 KiB; upgrade to streaming visitor only if limits increase.
const GUEST_BOOTSTRAP_SOURCE = `(function () {
  'use strict';
  const Global = globalThis;
  const ObjectCtor = Global.Object;
  const ObjectProto = ObjectCtor.prototype;
  const ArrayCtor = Global.Array;
  const ArrayProto = ArrayCtor.prototype;
  const FunctionProto = Global.Function.prototype;
  const uncurryThis = FunctionProto.bind.bind(FunctionProto.call);

  const getPrototypeOf = ObjectCtor.getPrototypeOf;
  const getOwnPropertyNames = ObjectCtor.getOwnPropertyNames;
  const getOwnPropertySymbols = ObjectCtor.getOwnPropertySymbols;
  const getOwnPropertyDescriptor = ObjectCtor.getOwnPropertyDescriptor;
  const defineProperty = ObjectCtor.defineProperty;
  const isArray = ArrayCtor.isArray;
  const numberIsFinite = Global.Number.isFinite;
  const jsonParse = Global.JSON.parse;
  const stringCharCodeAt = uncurryThis(Global.String.prototype.charCodeAt);
  const numberToString = uncurryThis(Global.Number.prototype.toString);
  const setAdd = uncurryThis(Global.Set.prototype.add);
  const setHas = uncurryThis(Global.Set.prototype.has);
  const setDelete = uncurryThis(Global.Set.prototype.delete);
  const weakSetAdd = uncurryThis(Global.WeakSet.prototype.add);
  const weakSetHas = uncurryThis(Global.WeakSet.prototype.has);
  const SetCtor = Global.Set;
  const WeakSetCtor = Global.WeakSet;
  const TypeErrorCtor = Global.TypeError;
  const reflectConstruct = Global.Reflect.construct;

  delete Global.WebAssembly;
  delete Global.fetch;
  delete Global.process;
  delete Global.require;
  delete Global.Bun;
  delete Global.Buffer;
  delete Global.setTimeout;
  delete Global.XMLHttpRequest;

  const proxyRegistry = new WeakSetCtor();
  const NativeProxy = Global.Proxy;
  if (typeof NativeProxy === 'function') {
    const NativeRevocable = NativeProxy.revocable;
    const WrappedProxy = function Proxy(target, handler) {
      if (!new.target) {
        throw new TypeErrorCtor("Constructor Proxy requires 'new'");
      }
      const instance = reflectConstruct(NativeProxy, arguments);
      weakSetAdd(proxyRegistry, instance);
      return instance;
    };
    if (typeof NativeRevocable === 'function') {
      const callRevocable = uncurryThis(NativeRevocable);
      defineProperty(WrappedProxy, 'revocable', {
        configurable: true,
        writable: true,
        enumerable: false,
        value: function revocable(target, handler) {
          const res = callRevocable(NativeProxy, target, handler);
          if (
            res &&
            (typeof res.proxy === 'object' || typeof res.proxy === 'function') &&
            res.proxy !== null
          ) {
            weakSetAdd(proxyRegistry, res.proxy);
          }
          return res;
        },
      });
    }
    Global.Proxy = WrappedProxy;
  }

  const HEX = '0123456789abcdef';
  function hex4(code) {
    return (
      '\\\\u' +
      HEX[(code >> 12) & 15] +
      HEX[(code >> 8) & 15] +
      HEX[(code >> 4) & 15] +
      HEX[code & 15]
    );
  }

  function serializeString(str, addBytes) {
    const len = str.length;
    addBytes(2);
    let out = '"';
    for (let i = 0; i < len; i++) {
      const code = stringCharCodeAt(str, i);
      if (code === 34) {
        addBytes(2);
        out += '\\\\"';
      } else if (code === 92) {
        addBytes(2);
        out += '\\\\\\\\';
      } else if (code === 8) {
        addBytes(2);
        out += '\\\\b';
      } else if (code === 12) {
        addBytes(2);
        out += '\\\\f';
      } else if (code === 10) {
        addBytes(2);
        out += '\\\\n';
      } else if (code === 13) {
        addBytes(2);
        out += '\\\\r';
      } else if (code === 9) {
        addBytes(2);
        out += '\\\\t';
      } else if (code < 32) {
        addBytes(6);
        out += hex4(code);
      } else if (code < 0x80) {
        addBytes(1);
        out += str[i];
      } else if (code < 0x800) {
        addBytes(2);
        out += str[i];
      } else if (code >= 0xd800 && code <= 0xdbff) {
        if (i + 1 < len) {
          const low = stringCharCodeAt(str, i + 1);
          if (low >= 0xdc00 && low <= 0xdfff) {
            addBytes(4);
            out += str[i] + str[i + 1];
            i++;
            continue;
          }
        }
        addBytes(6);
        out += hex4(code);
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        addBytes(6);
        out += hex4(code);
      } else {
        addBytes(3);
        out += str[i];
      }
    }
    return out + '"';
  }

  function validateAndSerialize(rootVal, maxDepth, maxBytes) {
    const seen = new SetCtor();
    let bytes = 0;
    const addBytes = function (n) {
      bytes += n;
      if (bytes > maxBytes) {
        throw 'LIMIT';
      }
    };

    const walk = function (val, depth) {
      if (val === null) {
        addBytes(4);
        return 'null';
      }
      const t = typeof val;
      if (t === 'boolean') {
        if (val) {
          addBytes(4);
          return 'true';
        }
        addBytes(5);
        return 'false';
      }
      if (t === 'number') {
        if (!numberIsFinite(val)) {
          throw 'INVALID';
        }
        const norm = val === 0 ? 0 : val;
        const numStr = numberToString(norm);
        addBytes(numStr.length);
        return numStr;
      }
      if (t === 'string') {
        return serializeString(val, addBytes);
      }
      if (t !== 'object') {
        throw 'INVALID';
      }
      if (weakSetHas(proxyRegistry, val) || setHas(seen, val) || depth >= maxDepth) {
        throw 'INVALID';
      }
      if (getOwnPropertySymbols(val).length > 0) {
        throw 'INVALID';
      }
      if (isArray(val)) {
        if (getPrototypeOf(val) !== ArrayProto) {
          throw 'INVALID';
        }
        const len = val.length;
        if (getOwnPropertyNames(val).length !== len + 1) {
          throw 'INVALID';
        }
        addBytes(2);
        setAdd(seen, val);
        let arrStr = '[';
        for (let i = 0; i < len; i++) {
          const desc = getOwnPropertyDescriptor(val, i);
          if (
            !desc ||
            !desc.enumerable ||
            !('value' in desc) ||
            desc.get !== undefined ||
            desc.set !== undefined
          ) {
            throw 'INVALID';
          }
          if (i > 0) {
            addBytes(1);
            arrStr += ',';
          }
          arrStr += walk(desc.value, depth + 1);
        }
        setDelete(seen, val);
        return arrStr + ']';
      }

      const proto = getPrototypeOf(val);
      if (proto !== ObjectProto && proto !== null) {
        throw 'INVALID';
      }
      const keys = getOwnPropertyNames(val);
      addBytes(2);
      setAdd(seen, val);
      let objStr = '{';
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k === '__proto__' || k === 'prototype' || k === 'constructor') {
          throw 'INVALID';
        }
        const desc = getOwnPropertyDescriptor(val, k);
        if (
          !desc ||
          !desc.enumerable ||
          !('value' in desc) ||
          desc.get !== undefined ||
          desc.set !== undefined
        ) {
          throw 'INVALID';
        }
        if (i > 0) {
          addBytes(1);
          objStr += ',';
        }
        const keyJson = serializeString(k, addBytes);
        addBytes(1);
        const valJson = walk(desc.value, depth + 1);
        objStr += keyJson + ':' + valJson;
      }
      setDelete(seen, val);
      return objStr + '}';
    };

    return walk(rootVal, 0);
  }

  let storedInput = null;
  return function (step, payload) {
    if (step === 0) {
      storedInput = jsonParse(payload);
      return 'OK';
    }
    const runFn = Global.run;
    if (typeof runFn !== 'function' || weakSetHas(proxyRegistry, runFn)) {
      return 'INVALID';
    }
    const invokeRun = uncurryThis(runFn);
    const rawResult = invokeRun(undefined, storedInput);
    try {
      return 'OK:' + validateAndSerialize(rawResult, 20, 32768);
    } catch (tag) {
      if (tag === 'LIMIT') return 'LIMIT';
      if (tag === 'INVALID') return 'INVALID';
      throw tag;
    }
  };
})()`;

function isHostResourceException(err: unknown, interrupted: boolean): boolean {
  if (interrupted) {
    return true;
  }
  if (err instanceof RangeError) {
    return true;
  }
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? '');
  return /call stack|stack overflow|out of memory|unreachable|aborted/i.test(msg);
}

function classifyVmError(
  runtime: QuickJSRuntime,
  context: QuickJSContext,
  errorHandle: QuickJSHandle,
  interrupted: boolean,
  fallbackCode: 'TEST_FAILED' | 'EXECUTION_FAILED',
): TemporaryToolErrorCode {
  if (interrupted) {
    return 'RESOURCE_LIMIT';
  }
  try {
    runtime.removeInterruptHandler();
    runtime.setMemoryLimit(-1);
    const dumped: unknown = context.dump(errorHandle);
    const summary =
      typeof dumped === 'object' && dumped !== null
        ? `${String((dumped as Record<string, unknown>).name ?? '')} ${String((dumped as Record<string, unknown>).message ?? '')}`
        : String(dumped ?? '');
    if (/interrupted|out of memory|stack overflow|maximum call stack/i.test(summary)) {
      return 'RESOURCE_LIMIT';
    }
  } catch {
    return 'RESOURCE_LIMIT';
  }
  return fallbackCode;
}

function safeDispose(handle: { alive?: boolean; dispose: () => void } | undefined): void {
  if (!handle) {
    return;
  }
  try {
    if (handle.alive !== false) {
      handle.dispose();
    }
  } catch {
    // WASM stack unwinds can leave internal QuickJS GC lists non-empty on process exit
  }
}

function runInFreshQuickJS(
  quickjs: QuickJSWASMModule,
  source: string,
  input: JsonValue,
  timeoutMs: number,
  failureCode: 'TEST_FAILED' | 'EXECUTION_FAILED',
): JsonValue {
  const runtime = quickjs.newRuntime();
  let context: QuickJSContext | undefined;
  let harnessFn: QuickJSHandle | undefined;
  let interrupted = false;

  try {
    runtime.setMemoryLimit(QUICKJS_MEMORY_LIMIT_BYTES);
    runtime.setMaxStackSize(QUICKJS_MAX_STACK_BYTES);
    runtime.removeModuleLoader();

    const deadline = performance.now() + timeoutMs;
    runtime.setInterruptHandler(() => {
      if (performance.now() >= deadline) {
        interrupted = true;
        return true;
      }
      return false;
    });

    context = runtime.newContext();

    const bootRes = context.evalCode(GUEST_BOOTSTRAP_SOURCE, 'bootstrap.js', {
      type: 'global',
    });
    if (bootRes.error) {
      const code = classifyVmError(runtime, context, bootRes.error, interrupted, failureCode);
      safeDispose(bootRes.error);
      throw new TemporaryToolError(code);
    }
    harnessFn = bootRes.value;

    const stepZeroHandle = context.newNumber(0);
    const inputStrHandle = context.newString(JSON.stringify(input));
    try {
      const prepRes = context.callFunction(
        harnessFn,
        context.undefined,
        stepZeroHandle,
        inputStrHandle,
      );
      if (prepRes.error) {
        const code = classifyVmError(runtime, context, prepRes.error, interrupted, failureCode);
        safeDispose(prepRes.error);
        throw new TemporaryToolError(code);
      }
      safeDispose(prepRes.value);
    } finally {
      safeDispose(stepZeroHandle);
      safeDispose(inputStrHandle);
    }

    const sourceRes = context.evalCode(source, 'temporary-tool.js', {
      type: 'global',
    });
    if (sourceRes.error) {
      const code = classifyVmError(runtime, context, sourceRes.error, interrupted, failureCode);
      safeDispose(sourceRes.error);
      throw new TemporaryToolError(code);
    }
    safeDispose(sourceRes.value);

    const stepOneHandle = context.newNumber(1);
    const emptyStrHandle = context.newString('');
    let statusText = '';
    try {
      const invokeRes = context.callFunction(
        harnessFn,
        context.undefined,
        stepOneHandle,
        emptyStrHandle,
      );
      if (invokeRes.error) {
        const code = classifyVmError(runtime, context, invokeRes.error, interrupted, failureCode);
        safeDispose(invokeRes.error);
        throw new TemporaryToolError(code);
      }
      try {
        statusText = context.getString(invokeRes.value);
      } finally {
        safeDispose(invokeRes.value);
      }
    } finally {
      safeDispose(stepOneHandle);
      safeDispose(emptyStrHandle);
    }

    if (statusText === 'LIMIT') {
      throw new TemporaryToolError('RESOURCE_LIMIT');
    }
    if (statusText === 'INVALID' || !statusText.startsWith('OK:')) {
      throw new TemporaryToolError(failureCode);
    }

    const rawJson = statusText.slice(3);
    if (utf8ByteLength(rawJson) > MAX_IPC_OUTPUT_BYTES) {
      throw new TemporaryToolError('RESOURCE_LIMIT');
    }
    const parsed: unknown = JSON.parse(rawJson);
    try {
      return validateJson(parsed, MAX_IPC_OUTPUT_BYTES);
    } catch {
      throw new TemporaryToolError(failureCode);
    }
  } catch (err) {
    if (err instanceof TemporaryToolError) {
      throw err;
    }
    if (isHostResourceException(err, interrupted)) {
      throw new TemporaryToolError('RESOURCE_LIMIT');
    }
    throw new TemporaryToolError(failureCode);
  } finally {
    safeDispose(harnessFn);
    safeDispose(context);
    safeDispose(runtime);
  }
}

async function main(): Promise<void> {
  let totalStdinBytes = 0;
  let totalStdoutBytes = 0;
  let stdinBuffer = '';
  let stdinEnded = false;
  let quickjs: QuickJSWASMModule | null = null;
  const queuedLines: string[] = [];
  type ChildPhase = 'awaiting_first' | 'running_tests' | 'awaiting_execute' | 'done';
  let phase = 'awaiting_first' as ChildPhase;
  let savedSource = '';

  const writeRawLine = (payload: Record<string, unknown>): void => {
    const line = `${JSON.stringify(payload)}\n`;
    const lineBytes = utf8ByteLength(line);
    if (totalStdoutBytes + lineBytes > MAX_IPC_OUTPUT_BYTES) {
      const fallback = `${JSON.stringify({
        type: 'error',
        code: 'RESOURCE_LIMIT',
        message: 'RESOURCE_LIMIT',
      })}\n`;
      process.stdout.write(fallback);
      process.exit(0);
    }
    totalStdoutBytes += lineBytes;
    process.stdout.write(line);
  };

  function failAndExit(code: TemporaryToolErrorCode): never {
    phase = 'done';
    writeRawLine({ type: 'error', code, message: code });
    process.exit(0);
  }

  const handleLine = (qjs: QuickJSWASMModule, line: string): void => {
    if (phase === 'done' || phase === 'running_tests') {
      failAndExit('EXECUTION_FAILED');
    }

    let msg: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        failAndExit('EXECUTION_FAILED');
      }
      msg = parsed as Record<string, unknown>;
    } catch {
      failAndExit('EXECUTION_FAILED');
    }

    if (phase === 'awaiting_first') {
      if (stdinBuffer.length > 0 || queuedLines.length > 0) {
        failAndExit('EXECUTION_FAILED');
      }

      if (msg.type === 'probe' && Object.keys(msg).length === 1) {
        phase = 'done';
        const probeOut = runInFreshQuickJS(
          qjs,
          'function run(input) { return { ready: input === 1 }; }',
          1,
          TEST_INTERRUPT_MS,
          'EXECUTION_FAILED',
        );
        if (!jsonEquals(probeOut, { ready: true })) {
          failAndExit('EXECUTION_FAILED');
        }
        writeRawLine({ type: 'probe_ok' });
        process.exit(0);
      }

      if (msg.type !== 'tests' || Object.keys(msg).length !== 3) {
        failAndExit('EXECUTION_FAILED');
      }

      let validatedCall: TemporaryToolCall;
      try {
        validatedCall = parseTemporaryToolCall({
          label: 'sandbox',
          purpose: 'sandbox',
          source: msg.source,
          snapshotRefs: [],
          parameters: null,
          tests: msg.tests,
        });
      } catch (err) {
        failAndExit(err instanceof TemporaryToolError ? err.code : 'INVALID_INPUT');
      }

      phase = 'running_tests';
      savedSource = validatedCall.source;
      try {
        for (const testCase of validatedCall.tests) {
          const actual = runInFreshQuickJS(
            qjs,
            savedSource,
            testCase.input,
            TEST_INTERRUPT_MS,
            'TEST_FAILED',
          );
          if (!jsonEquals(actual, testCase.expected)) {
            failAndExit('TEST_FAILED');
          }
        }
      } catch (err) {
        failAndExit(err instanceof TemporaryToolError ? err.code : 'TEST_FAILED');
      }

      if (stdinBuffer.length > 0 || queuedLines.length > 0) {
        failAndExit('EXECUTION_FAILED');
      }
      phase = 'awaiting_execute';
      writeRawLine({ type: 'tests_passed', passedTests: validatedCall.tests.length });
      return;
    }

    if (phase === 'awaiting_execute') {
      if (
        stdinBuffer.length > 0 ||
        queuedLines.length > 0 ||
        msg.type !== 'execute' ||
        Object.keys(msg).length !== 2
      ) {
        failAndExit('EXECUTION_FAILED');
      }
      let validInput: JsonValue;
      try {
        validInput = validateJson(msg.input, MAX_INPUT_BYTES);
      } catch (err) {
        failAndExit(err instanceof TemporaryToolError ? err.code : 'INVALID_INPUT');
      }

      phase = 'done';
      try {
        const resultValue = runInFreshQuickJS(
          qjs,
          savedSource,
          validInput,
          LIVE_INTERRUPT_MS,
          'EXECUTION_FAILED',
        );
        if (stdinBuffer.length > 0 || queuedLines.length > 0) {
          failAndExit('EXECUTION_FAILED');
        }
        writeRawLine({ type: 'result', value: resultValue });
        process.exit(0);
      } catch (err) {
        failAndExit(err instanceof TemporaryToolError ? err.code : 'EXECUTION_FAILED');
      }
    }
  };

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    totalStdinBytes += utf8ByteLength(chunk);
    if (totalStdinBytes > MAX_STDIN_ENVELOPE_BYTES) {
      failAndExit('INVALID_INPUT');
    }
    stdinBuffer += chunk;
    const newlineIdx = stdinBuffer.indexOf('\n');
    if (newlineIdx === -1) {
      return;
    }
    const line = stdinBuffer.slice(0, newlineIdx);
    stdinBuffer = stdinBuffer.slice(newlineIdx + 1);
    if (quickjs === null) {
      queuedLines.push(line);
      return;
    }
    handleLine(quickjs, line);
  });

  process.stdin.on('end', () => {
    stdinEnded = true;
    if (quickjs !== null && phase !== 'done') {
      process.exit(1);
    }
  });

  quickjs = await getQuickJS();
  while (queuedLines.length > 0) {
    const nextLine = queuedLines.shift()!;
    handleLine(quickjs, nextLine);
  }
  if (stdinEnded && phase !== 'done') {
    process.exit(1);
  }
}

main().catch(() => {
  process.exit(1);
});