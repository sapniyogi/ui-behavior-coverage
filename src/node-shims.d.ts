declare const process: {
  argv: string[];
  exitCode?: number;
  stdout: { write(message: string): void };
  stderr: { write(message: string): void };
};

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
}

declare module 'node:test' {
  const test: (name: string, fn: () => void | Promise<void>) => void;
  export default test;
}

declare module 'node:assert/strict' {
  interface Assert {
    equal(actual: unknown, expected: unknown, message?: string): void;
    match(actual: string, regexp: RegExp, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
  }
  const assert: Assert;
  export default assert;
}
