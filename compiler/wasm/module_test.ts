import { assertEquals } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import { WasmModule, WasmType } from "./module.ts";
import { WasmExpression  } from "./expressions.ts";

Deno.test('sample module', async () => {
  const module = new WasmModule();
  const op = module.import('operations', 'smt', [WasmType.I32, WasmType.I32], [WasmType.I32]);
  module.define([WasmType.I32, WasmType.I32], [WasmType.I32], { export: 'num' })
    .body = new WasmExpression(0x20, 0, 0x20, 1, 0x10, op);
  const { instance } = await WebAssembly.instantiate(module.code, {
    operations: { smt: (a: number, b: number) => (a+b) * (a-b) }
  });
  assertEquals((instance.exports.num as CallableFunction)(20, 10), 300);
});

Deno.test('tables', async () => {
  const module = new WasmModule();
  const a = module.define([], [WasmType.I32]);
  a.body = new WasmExpression(0x41, 20);
  const b = module.define([], [WasmType.I32]);
  b.body = new WasmExpression(0x41, 30);
  const t = module.table([a.funcIdx, b.funcIdx]);
  module.define([WasmType.I32], [WasmType.I32], { export: 'run' })
    .body = new WasmExpression(0x20, 0, 0x11, t, a.typeIdx);
  const { instance } = await WebAssembly.instantiate(module.code);
  assertEquals((instance.exports.run as CallableFunction)(0), 20);
  assertEquals((instance.exports.run as CallableFunction)(1), 30);
});