import { wasm } from './common.ts';
import { Generator, ModuleProvider } from '../generator/generator.ts';
import type { Compiler } from '../compiler.ts';
import { ExpressionCompiler } from './expression.ts';
import { FunctionManager } from './functions.ts';

export class WasmCompiler implements Compiler {
  private readonly generator: Generator;

  constructor(provider: ModuleProvider) {
    this.generator = new Generator(provider);
  }

  compile(file: string): Uint8Array {
    const generated = this.generator.generateKnownModule([file]);
    const module = new wasm.WasmModule();
    const manager = new FunctionManager(module);
    for (const def of Object.values(generated.defs))
      manager.insertDef(def);
    for (const func of manager) {
      if (typeof func.source === 'number') continue;
      const expr = new ExpressionCompiler(manager);
      manager.setBody(func, expr.expression.code);
    }
    return module.code;
  }
}