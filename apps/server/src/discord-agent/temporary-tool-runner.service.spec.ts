import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TemporaryToolRunnerService } from './temporary-tool-runner.service';
import { SandboxRequest, TemporaryToolError } from './temporary-tool.types';

describe('TemporaryToolRunnerService', () => {
  let runner: TemporaryToolRunnerService;

  beforeEach(async () => {
    runner = new TemporaryToolRunnerService();
    await runner.onModuleInit();
  });

  afterEach(async () => {
    await runner.onModuleDestroy();
  });

  test('runs_channel_grouping_in_quickjs', async () => {
    expect(runner.ready).toBe(true);

    const source = `
      function run(input) {
        const grouped = {};
        const channels = input.snapshots[0] || [];
        for (const ch of channels) {
          const category = ch.category || 'Uncategorized';
          if (!grouped[category]) grouped[category] = [];
          grouped[category].push(ch.name);
        }
        return grouped;
      }
    `;

    const request: SandboxRequest = {
      source,
      tests: [
        {
          input: {
            snapshots: [
              [
                { name: 'a', category: 'General' },
                { name: 'b', category: 'General' },
                { name: 'mod', category: 'Staff' },
              ],
            ],
            parameters: null,
          },
          expected: { Staff: ['mod'], General: ['a', 'b'] },
        },
      ],
      input: {
        snapshots: [
          [
            { name: 'a', category: 'General' },
            { name: 'b', category: 'General' },
          ],
        ],
        parameters: null,
      },
    };

    const result = await runner.execute(request, new AbortController().signal);
    expect(result.value).toEqual({ General: ['a', 'b'] });
    expect(result.passedTests).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    await expect(
      runner.execute(
        {
          ...request,
          tests: [
            {
              input: {
                snapshots: [
                  [
                    { name: 'a', category: 'General' },
                    { name: 'b', category: 'General' },
                  ],
                ],
                parameters: null,
              },
              expected: { General: ['b', 'a'] },
            },
          ],
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      name: 'TemporaryToolError',
      code: 'TEST_FAILED',
    });
  });

  test('failed_test_never_receives_live_input', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nio-phase-test-'));
    try {
      const stdinRecordFile = path.join(tmpDir, 'stdin.log');
      const compiledChild = path.resolve(__dirname, '../../dist/discord-agent/temporary-tool-child.js');
      const teeChildPath = path.join(tmpDir, 'tee-child.js');
      fs.writeFileSync(
        teeChildPath,
        `
        const fs = require('fs');
        process.stdin.on('data', (chunk) => {
          fs.appendFileSync(${JSON.stringify(stdinRecordFile)}, chunk);
        });
        require(${JSON.stringify(compiledChild)});
        `,
        'utf8',
      );

      const teeRunner = new TemporaryToolRunnerService(teeChildPath);
      await teeRunner.onModuleInit();

      const canary = 'LIVE_GUILD_SNAPSHOT_SECRET_CANARY_991';
      await expect(
        teeRunner.execute(
          {
            source: `
              function run(input) {
                if (input && input.snapshots) {
                  while (true) {}
                }
                return { got: input };
              }
            `,
            tests: [
              {
                input: { testOnly: true },
                expected: { got: { testOnly: false } },
              },
            ],
            input: {
              snapshots: [{ channelName: canary }],
              parameters: null,
            },
          },
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({
        name: 'TemporaryToolError',
        code: 'TEST_FAILED',
      });

      const recordedStdin = fs.readFileSync(stdinRecordFile, 'utf8');
      expect(recordedStdin).toContain('"type":"tests"');
      expect(recordedStdin).not.toContain('"type":"execute"');
      expect(recordedStdin).not.toContain(canary);
      await teeRunner.onModuleDestroy();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('does_not_expose_host_globals_or_env', async () => {
    process.env.NIO_SENSITIVE_HOST_ENV_TEST = 'top_secret_token_value';
    try {
      const probeResult = await runner.execute(
        {
          source: `
            function run() {
              return {
                process: typeof process,
                require: typeof require,
                fetch: typeof fetch,
                bun: typeof Bun,
                buffer: typeof Buffer,
                wasm: typeof WebAssembly,
                setTimeout: typeof setTimeout,
                xmlHttp: typeof XMLHttpRequest,
              };
            }
          `,
          tests: [
            {
              input: null,
              expected: {
                process: 'undefined',
                require: 'undefined',
                fetch: 'undefined',
                bun: 'undefined',
                buffer: 'undefined',
                wasm: 'undefined',
                setTimeout: 'undefined',
                xmlHttp: 'undefined',
              },
            },
          ],
          input: null,
        },
        new AbortController().signal,
      );

      expect(probeResult.value).toEqual({
        process: 'undefined',
        require: 'undefined',
        fetch: 'undefined',
        bun: 'undefined',
        buffer: 'undefined',
        wasm: 'undefined',
        setTimeout: 'undefined',
        xmlHttp: 'undefined',
      });

      await expect(
        runner.execute(
          {
            source: `
              function run(input) {
                if (input && input.live) {
                  return import('fs');
                }
                return { ok: true };
              }
            `,
            tests: [{ input: { live: false }, expected: { ok: true } }],
            input: { live: true },
          },
          new AbortController().signal,
        ),
      ).rejects.toBeInstanceOf(TemporaryToolError);
    } finally {
      delete process.env.NIO_SENSITIVE_HOST_ENV_TEST;
    }
  });

  test('ignores_replaced_stringify_and_rejects_non_json_output', async () => {
    const result = await runner.execute(
      {
        source: `
          function run(input) {
            JSON.stringify = function () {
              return '{"admin":true}';
            };
            Object.prototype.toJSON = function () {
              return { admin: true };
            };
            Array.prototype.toJSON = function () {
              return ['admin'];
            };
            return { a: input.value };
          }
        `,
        tests: [{ input: { value: 1 }, expected: { a: 1 } }],
        input: { value: 1 },
      },
      new AbortController().signal,
    );

    expect(result.value).toEqual({ a: 1 });

    const invalidCases = [
      'Promise.resolve(1)',
      'function () { return 1; }',
      'undefined',
      'NaN',
      'Infinity',
      '-Infinity',
      '1n',
      '[1, , 3]',
      '(function(){ const c = {}; c.self = c; return c; })()',
      '({ get a() { return 1; } })',
      'new Proxy({ a: 1 }, {})',
      'new Proxy({ a: 1 }, { get() { throw new Error("proxy error"); } })',
      '(function(){ let v = 1; for (let i = 0; i < 21; i++) v = { a: v }; return v; })()',
    ];

    for (const expr of invalidCases) {
      await expect(
        runner.execute(
          {
            source: `
              function run(input) {
                if (!input || !input.live) return { ok: true };
                return ${expr};
              }
            `,
            tests: [{ input: { live: false }, expected: { ok: true } }],
            input: { live: true },
          },
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({
        name: 'TemporaryToolError',
        code: 'EXECUTION_FAILED',
      });
    }
  });

  test('bounds_loop_recursion_allocation_and_output', async () => {
    const resourceCases = [
      'while (true) {}',
      'const o = { get x() { while (true) {} } }; return o.x;',
      'const p = new Proxy({ a: 1 }, { get() { while (true) {} } }); return p.a;',
      'function f(n) { return 1 + f(n + 1); } return f(0);',
      'const a = []; while (true) { a.push("x".repeat(65536)); }',
      'return "x".repeat(40 * 1024);',
    ];

    for (const body of resourceCases) {
      await expect(
        runner.execute(
          {
            source: `
              function run(input) {
                if (!input || !input.live) return { ok: true };
                ${body}
              }
            `,
            tests: [{ input: { live: false }, expected: { ok: true } }],
            input: { live: true },
          },
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({
        name: 'TemporaryToolError',
        code: 'RESOURCE_LIMIT',
      });
    }

    const slowReq: SandboxRequest = {
      source: `
        function run(input) {
          if (!input || !input.live) return { ok: true };
          const start = Date.now();
          while (Date.now() - start < 250) {}
          return { ok: true };
        }
      `,
      tests: [{ input: { live: false }, expected: { ok: true } }],
      input: { live: true },
    };

    const p1 = runner.execute(slowReq, new AbortController().signal);
    const p2 = runner.execute(slowReq, new AbortController().signal);
    const p3 = runner.execute(slowReq, new AbortController().signal);

    await expect(p3).rejects.toMatchObject({
      name: 'TemporaryToolError',
      code: 'CAPACITY_EXCEEDED',
    });
    await expect(Promise.all([p1, p2])).resolves.toEqual([
      expect.objectContaining({ value: { ok: true } }),
      expect.objectContaining({ value: { ok: true } }),
    ]);
  }, 30000);

  test('kills_malformed_or_flooding_child', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nio-child-test-'));
    try {
      const writeChildFixture = (name: string, body: string): string => {
        const filePath = path.join(tmpDir, name);
        fs.writeFileSync(
          filePath,
          `
          let probed = false;
          process.stdin.setEncoding('utf8');
          let buf = '';
          process.stdin.on('data', (chunk) => {
            buf += chunk;
            const nl = buf.indexOf('\\n');
            if (nl === -1) return;
            const first = JSON.parse(buf.slice(0, nl));
            if (first.type === 'probe' && !probed) {
              probed = true;
              process.stdout.write(JSON.stringify({ type: 'probe_ok' }) + '\\n');
              process.exit(0);
              return;
            }
            ${body}
          });
          `,
          'utf8',
        );
        return filePath;
      };

      const baseReq: SandboxRequest = {
        source: 'function run() { return { ok: true }; }',
        tests: [{ input: null, expected: { ok: true } }],
        input: null,
      };

      const malformedRunner = new TemporaryToolRunnerService(
        writeChildFixture('malformed.js', `process.stdout.write('NOT_JSON\\n'); process.exit(0);`),
      );
      await expect(
        malformedRunner.execute(baseReq, new AbortController().signal),
      ).rejects.toMatchObject({
        name: 'TemporaryToolError',
        code: 'EXECUTION_FAILED',
      });
      await malformedRunner.onModuleDestroy();

      const outOfOrderRunner = new TemporaryToolRunnerService(
        writeChildFixture(
          'out-of-order.js',
          `process.stdout.write(JSON.stringify({ type: 'result', value: { ok: true } }) + '\\n'); process.exit(0);`,
        ),
      );
      await expect(
        outOfOrderRunner.execute(baseReq, new AbortController().signal),
      ).rejects.toMatchObject({
        name: 'TemporaryToolError',
        code: 'EXECUTION_FAILED',
      });
      await outOfOrderRunner.onModuleDestroy();

      const stdoutFloodRunner = new TemporaryToolRunnerService(
        writeChildFixture(
          'stdout-flood.js',
          `process.stdout.write('x'.repeat(64 * 1024));`,
        ),
      );
      await expect(
        stdoutFloodRunner.execute(baseReq, new AbortController().signal),
      ).rejects.toMatchObject({
        name: 'TemporaryToolError',
        code: 'RESOURCE_LIMIT',
      });
      await stdoutFloodRunner.onModuleDestroy();

      const stderrFloodRunner = new TemporaryToolRunnerService(
        writeChildFixture(
          'stderr-flood.js',
          `process.stderr.write('SECRET_STDERR_LEAK_'.repeat(400));`,
        ),
      );
      const stderrErr = await stderrFloodRunner
        .execute(baseReq, new AbortController().signal)
        .catch((err: unknown) => err);
      expect(stderrErr).toBeInstanceOf(TemporaryToolError);
      expect((stderrErr as TemporaryToolError).code).toBe('RESOURCE_LIMIT');
      expect((stderrErr as Error).message).not.toContain('SECRET_STDERR_LEAK_');
      await stderrFloodRunner.onModuleDestroy();

      const abortController = new AbortController();
      const abortPromise = runner.execute(
        {
          source: `
            function run(input) {
              if (!input || !input.live) return { ok: true };
              while (true) {}
            }
          `,
          tests: [{ input: { live: false }, expected: { ok: true } }],
          input: { live: true },
        },
        abortController.signal,
      );
      setTimeout(() => abortController.abort(), 80);
      await expect(abortPromise).rejects.toMatchObject({
        name: 'TemporaryToolError',
        code: 'RUN_CANCELLED',
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('startup_failure_has_no_host_fallback', async () => {
    const missingPath = path.join(os.tmpdir(), 'non-existent-quickjs-child-entrypoint.js');
    const badRunner = new TemporaryToolRunnerService(missingPath);
    await badRunner.onModuleInit();

    expect(badRunner.ready).toBe(false);

    (globalThis as Record<string, unknown>).__HOST_FALLBACK_TOUCHED__ = false;
    await expect(
      badRunner.execute(
        {
          source: `
            function run() {
              globalThis.__HOST_FALLBACK_TOUCHED__ = true;
              return { ok: true };
            }
          `,
          tests: [{ input: null, expected: { ok: true } }],
          input: null,
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      name: 'TemporaryToolError',
      code: 'RUNNER_UNAVAILABLE',
    });

    expect((globalThis as Record<string, unknown>).__HOST_FALLBACK_TOUCHED__).toBe(false);
    delete (globalThis as Record<string, unknown>).__HOST_FALLBACK_TOUCHED__;
    await badRunner.onModuleDestroy();
  });
});