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

Deno.test('locals', async () => {
  {
    const module = new WasmModule();
    module.define([WasmType.I32], [WasmType.I32], { export: 'dupsum' }).body = {
      code: new WasmExpression(0x20, 0, 0x21, 1, 0x20, 1, 0x20, 1, 0x6A),
      locals: [WasmType.I32]
    };
    const { instance } = await WebAssembly.instantiate(module.code);
    assertEquals((instance.exports.dupsum as CallableFunction)(20), 40);
  }
  {
    const module = new WasmModule();
    module.define([WasmType.I32, WasmType.I32], [WasmType.I32], { export: 'retsum' }).body = {
      code: new WasmExpression(0x20, 0, 0x20, 1, 0x6A, 0x21, 2, 0x20, 2),
      locals: [WasmType.I32]
    };
    const { instance } = await WebAssembly.instantiate(module.code);
    assertEquals((instance.exports.retsum as CallableFunction)(20, 30), 50);
  }
});

Deno.test('tables', async () => {
  const module = new WasmModule();
  const c = module.import('operations', 'val', [], [WasmType.I32]);
  const a = module.define([], [WasmType.I32]);
  a.body = new WasmExpression(0x41, 20);
  const b = module.define([], [WasmType.I32]);
  b.body = new WasmExpression(0x41, 30);
  const t = module.table([a.funcIdx, b.funcIdx, c]);
  module.define([WasmType.I32], [WasmType.I32], { export: 'run' })
    .body = new WasmExpression(0x20, 0, 0x11, a.typeIdx, t);
  const { instance } = await WebAssembly.instantiate(module.code, {
    operations: { val: () => 50 }
  });
  assertEquals((instance.exports.run as CallableFunction)(0), 20);
  assertEquals((instance.exports.run as CallableFunction)(1), 30);
  assertEquals((instance.exports.run as CallableFunction)(2), 50);
});

Deno.test('memory', async() => {  
  {
    const module = new WasmModule();
    module.configureMemory({ import: { mod: 'instance', name: 'memory' }, limits: { min: 1 }, exportAs: 'mem' })
    module.define([], [], { main: true }).body = new Uint8Array([0x41, 0, 0x41, 1, 0x36, 0, 0]);
    const memory = new WebAssembly.Memory({ initial: 1 });
    assertEquals(new Uint8Array(memory.buffer)[0], 0);
    const { instance } = await WebAssembly.instantiate(module.code, { instance: { memory } });
    assertEquals(new Uint8Array(memory.buffer)[0], 1);
    assertEquals(instance.exports.mem, memory);
  }
  {
    const module = new WasmModule();
    module.configureMemory({ limits: { min: 1 }, exportAs: 'mem' })
    module.define([], [], { main: true }).body = new Uint8Array([0x41, 10, 0x41, 1, 0x36, 0, 0]);
    const { instance } = await WebAssembly.instantiate(module.code);
    assertEquals(new Uint8Array((instance.exports.mem as WebAssembly.Memory).buffer)[10], 1);
  }
})