import { sapp, wasm, parser, convertToWasmType } from './common.ts';
import { Generator, GeneratorIO } from '../generator/generator.ts';
import type { Compiler } from '../compiler.ts';

class WasmContext {
  private readonly processedFunctions: Map<sapp.Func, number> = new Map();
  private readonly processedInstanceFunctions: Map<sapp.Func[], number[]> = new Map();

  constructor(public readonly module: wasm.WasmModule) { }

  getFunction(func: sapp.Func): number | undefined {
    return this.processedFunctions.get(func);
  }

  doFunc(func: sapp.Func): number {
    if (this.processedFunctions.has(func)) return this.processedFunctions.get(func) as number;
    const id = this.module.define(
      func.fullInputSignature.map(convertToWasmType),
      func.outputSignature.base === 'void' ? [] : [convertToWasmType(func.outputSignature)]
    );
    this.processedFunctions.set(func, id);
    return id;
  }

  doInstanceFunc(funcs: sapp.Func[]): number[] {
    if (!this.processedInstanceFunctions.has(funcs))
      this.processedInstanceFunctions.set(funcs, funcs.map(func => this.doFunc(func)));
    return this.processedInstanceFunctions.get(funcs) as number[];
  }

  doDef(def: sapp.Def) {
    for (const f of def.funcs) this.doFunc(f);
    for (const f of def.instanceFuncs) this.doInstanceFunc(f);
  }

  [Symbol.iterator] = (): Iterator<sapp.Func> => this.processedFunctions.keys();
}

class WasmFunctionProcessor {
  constructor(private readonly ctx: WasmContext) { }

  process(func: sapp.Func) {
  }
 
  processAll() {
    for (const func of this.ctx) this.process(func);
  }
}

export class WasmCompiler implements Compiler {
  private readonly generator: Generator;

  constructor(io: GeneratorIO) {
    this.generator = new Generator(io);
  }

  compile(file: string): Uint8Array {
    const parsed = this.generator.parseModule([file]);
    const module = new wasm.WasmModule();
    const ctx = new WasmContext(module);
    for (const def of Object.values(parsed.defs))
      ctx.doDef(def);
    const processor = new WasmFunctionProcessor(ctx);
    processor.processAll();
    return module.code;
  }
}