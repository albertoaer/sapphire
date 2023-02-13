import * as sapp from './parser/sapp.ts';
import { Parser, IOParserSupport } from './parser/parser.ts';
import { WasmModule } from './wasm/module.ts';

export interface Compiler {
  compile(file: string): Uint8Array;
}

class WasmContext {
  private readonly processedFunctions: Map<sapp.Func, number> = new Map();
  private readonly processedInstanceFunctions: Map<sapp.Func[], number[]> = new Map();

  constructor(private readonly module: WasmModule) { }

  doFunc(func: sapp.Func): number {
    if (this.processedFunctions.has(func)) return this.processedFunctions.get(func) as number;
    throw new Error('todo, process the function and get the index');
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
}

export class WasmCompiler implements Compiler {
  private readonly parser: Parser;

  constructor(io: IOParserSupport) {
    this.parser = new Parser(io);
  }

  compile(file: string): Uint8Array {
    const parsed = this.parser.parseModule([file]);
    const module = new WasmModule();
    const ctx = new WasmContext(module);
    for (const def of Object.values(parsed.defs))
      ctx.doDef(def);
    return module.code;
  }
}