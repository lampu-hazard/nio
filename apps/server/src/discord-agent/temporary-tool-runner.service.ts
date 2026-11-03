import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import {
  CHILD_HARD_TIMEOUT_MS,
  MAX_ACTIVE_CHILDREN,
  MAX_IPC_OUTPUT_BYTES,
  MAX_STDERR_BYTES,
  SandboxRequest,
  SandboxResult,
  TEMPORARY_TOOL_ERROR_CODES,
  TemporaryToolError,
  TemporaryToolErrorCode,
  validateJson,
  validateSandboxRequest,
} from './temporary-tool.types';

const VALID_ERROR_CODES = new Set<string>(TEMPORARY_TOOL_ERROR_CODES);

function buildMinimalChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    NO_COLOR: '1',
  };
  if (process.platform === 'win32') {
    for (const key of ['SystemRoot', 'SYSTEMDRIVE', 'WINDIR'] as const) {
      const value = process.env[key];
      if (typeof value === 'string' && value.length > 0) {
        env[key] = value;
      }
    }
  }
  return env;
}

function resolveChildEntrypoint(overridePath?: string): string {
  if (overridePath) {
    return path.resolve(overridePath);
  }
  const candidates = [
    path.resolve(__dirname, 'temporary-tool-child.js'),
    path.resolve(__dirname, '../../dist/discord-agent/temporary-tool-child.js'),
    path.resolve(process.cwd(), 'dist/discord-agent/temporary-tool-child.js'),
  ];
  if (typeof (process.versions as Record<string, string | undefined>).bun === 'string') {
    candidates.push(path.resolve(__dirname, 'temporary-tool-child.ts'));
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

// ponytail: fixed per-instance child pool of 2 processes; upgrade to warm worker pool only if spawn latency exceeds SLA.
@Injectable()
export class TemporaryToolRunnerService implements OnModuleInit, OnModuleDestroy {
  private _ready = false;
  private destroyed = false;
  private readonly childPath: string;
  private readonly activeChildren = new Set<childProcess.ChildProcess>();

  constructor(@Optional() childEntrypointPath?: string) {
    this.childPath = resolveChildEntrypoint(childEntrypointPath);
    this._ready = this.runStartupProbe();
  }

  get ready(): boolean {
    return this._ready && !this.destroyed;
  }

  async onModuleInit(): Promise<void> {
    if (!this.destroyed && !this._ready) {
      this._ready = this.runStartupProbe();
    }
  }

  private runStartupProbe(): boolean {
    if (!fs.existsSync(this.childPath)) {
      return false;
    }
    try {
      const res = childProcess.spawnSync(process.execPath, [this.childPath], {
        input: `${JSON.stringify({ type: 'probe' })}\n`,
        env: buildMinimalChildEnv(),
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: CHILD_HARD_TIMEOUT_MS,
        maxBuffer: MAX_IPC_OUTPUT_BYTES,
        encoding: 'utf8',
      });
      if (res.status !== 0 || res.error || typeof res.stdout !== 'string') {
        return false;
      }
      const lines = res.stdout.split('\n').filter((line) => line.length > 0);
      if (lines.length !== 1) {
        return false;
      }
      const parsed: unknown = JSON.parse(lines[0]);
      return (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed) &&
        (parsed as Record<string, unknown>).type === 'probe_ok'
      );
    } catch {
      return false;
    }
  }

  async execute(request: SandboxRequest, signal: AbortSignal): Promise<SandboxResult> {
    if (!this.ready) {
      throw new TemporaryToolError('RUNNER_UNAVAILABLE');
    }
    if (!signal || signal.aborted) {
      throw new TemporaryToolError('RUN_CANCELLED');
    }

    const validRequest = validateSandboxRequest(request);

    if (this.activeChildren.size >= MAX_ACTIVE_CHILDREN) {
      throw new TemporaryToolError('CAPACITY_EXCEEDED');
    }

    const startedAt = performance.now();
    const child = childProcess.spawn(process.execPath, [this.childPath], {
      shell: false,
      env: buildMinimalChildEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.activeChildren.add(child);

    return new Promise<SandboxResult>((resolve, reject) => {
      let settled = false;
      let phase: 'awaiting_tests_passed' | 'awaiting_result' | 'awaiting_exit' =
        'awaiting_tests_passed';
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let stdoutBuffer = '';
      let pendingResult: SandboxResult | null = null;

      const terminateChild = (): void => {
        this.activeChildren.delete(child);
        try {
          child.stdin?.destroy();
          child.stdout?.destroy();
          child.stderr?.destroy();
          if (child.exitCode === null && !child.killed) {
            child.kill('SIGKILL');
          }
        } catch {
          // Ignore child kill errors during teardown
        }
      };

      const cleanupListeners = (): void => {
        clearTimeout(hardTimer);
        signal.removeEventListener('abort', onAbort);
      };

      const settleError = (code: TemporaryToolErrorCode): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanupListeners();
        terminateChild();
        reject(new TemporaryToolError(code));
      };

      const settleSuccess = (result: SandboxResult): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanupListeners();
        this.activeChildren.delete(child);
        resolve(result);
      };

      const onAbort = (): void => {
        settleError('RUN_CANCELLED');
      };

      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) {
        settleError('RUN_CANCELLED');
        return;
      }

      const hardTimer = setTimeout(() => {
        settleError('RESOURCE_LIMIT');
      }, CHILD_HARD_TIMEOUT_MS);

      child.on('error', () => {
        settleError('EXECUTION_FAILED');
      });

      child.stdin.on('error', () => {
        // Ignore EPIPE when child exits early on test/validation failure
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBytes += chunk.byteLength;
        if (stderrBytes > MAX_STDERR_BYTES) {
          settleError('RESOURCE_LIMIT');
        }
      });

      const handleStdoutFrame = (line: string): void => {
        if (settled) {
          return;
        }
        if (phase === 'awaiting_exit') {
          settleError('EXECUTION_FAILED');
          return;
        }

        let frame: Record<string, unknown>;
        try {
          const parsed: unknown = JSON.parse(line);
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            settleError('EXECUTION_FAILED');
            return;
          }
          frame = parsed as Record<string, unknown>;
        } catch {
          settleError('EXECUTION_FAILED');
          return;
        }

        if (frame.type === 'error') {
          const rawCode = typeof frame.code === 'string' ? frame.code : 'EXECUTION_FAILED';
          const mappedCode: TemporaryToolErrorCode = VALID_ERROR_CODES.has(rawCode)
            ? (rawCode as TemporaryToolErrorCode)
            : 'EXECUTION_FAILED';
          settleError(mappedCode);
          return;
        }

        if (phase === 'awaiting_tests_passed') {
          if (
            frame.type !== 'tests_passed' ||
            frame.passedTests !== validRequest.tests.length ||
            Object.keys(frame).length !== 2 ||
            stdoutBuffer.length > 0
          ) {
            settleError('EXECUTION_FAILED');
            return;
          }
          phase = 'awaiting_result';
          const executeFrame = `${JSON.stringify({
            type: 'execute',
            input: validRequest.input,
          })}\n`;
          child.stdin.write(executeFrame);
          child.stdin.end();
          return;
        }

        if (phase === 'awaiting_result') {
          if (
            frame.type !== 'result' ||
            !('value' in frame) ||
            Object.keys(frame).length !== 2 ||
            stdoutBuffer.length > 0
          ) {
            settleError('EXECUTION_FAILED');
            return;
          }
          try {
            const validatedValue = validateJson(frame.value, MAX_IPC_OUTPUT_BYTES);
            pendingResult = {
              value: validatedValue,
              passedTests: validRequest.tests.length,
              durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
            };
            phase = 'awaiting_exit';
          } catch {
            settleError('EXECUTION_FAILED');
          }
        }
      };

      child.stdout.on('data', (chunk: Buffer) => {
        if (settled) {
          return;
        }
        stdoutBytes += chunk.byteLength;
        if (stdoutBytes > MAX_IPC_OUTPUT_BYTES) {
          settleError('RESOURCE_LIMIT');
          return;
        }
        stdoutBuffer += chunk.toString('utf8');
        let newlineIdx = stdoutBuffer.indexOf('\n');
        while (newlineIdx !== -1 && !settled) {
          const line = stdoutBuffer.slice(0, newlineIdx);
          stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1);
          handleStdoutFrame(line);
          newlineIdx = stdoutBuffer.indexOf('\n');
        }
      });

      child.on('close', (exitCode: number | null) => {
        this.activeChildren.delete(child);
        if (settled) {
          return;
        }
        if (
          phase === 'awaiting_exit' &&
          pendingResult !== null &&
          stdoutBuffer.length === 0 &&
          exitCode === 0
        ) {
          settleSuccess(pendingResult);
          return;
        }
        settleError('EXECUTION_FAILED');
      });

      const testsFrame = `${JSON.stringify({
        type: 'tests',
        source: validRequest.source,
        tests: validRequest.tests,
      })}\n`;
      child.stdin.write(testsFrame);
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    this._ready = false;
    for (const child of this.activeChildren) {
      try {
        child.stdin?.destroy();
        child.stdout?.destroy();
        child.stderr?.destroy();
        if (child.exitCode === null && !child.killed) {
          child.kill('SIGKILL');
        }
      } catch {
        // Ignore errors when killing active child on shutdown
      }
    }
    this.activeChildren.clear();
  }
}