import { wasm } from './common.ts';
import { Generator, ModuleProvider } from '../generator/generator.ts';
import type { Compiler } from '../compiler.ts';
import { ExpressionCompiler } from './expression.ts';
import { FunctionManager } from './functions.ts';
import { EnvironmentInjector } from './env/mod.ts';
import { CompilerError } from '../errors.ts';

export class WasmCompiler implements Compiler {
  private readonly generator: Generator;

  constructor(provider: ModuleProvider) {
    this.generator = new Generator(provider);
  }

  compile(file: string): Uint8Array {
    const generated = this.generator.generateKnownModule([file]);
    const module = new wasm.WasmModule();
    const injector = new EnvironmentInjector();
    const manager = new FunctionManager(module, injector);
    for (const def of Object.values(generated.defs))
      manager.insertDef(def);
    for (const func of manager) {
      if (typeof func.source === 'number') continue;
      const expr = new ExpressionCompiler(manager);
      expr.submit(func.source);
      manager.setBody(func, expr.expression.code);
    }
    for (const def of generated.exports) {
      for (const [name, func] of Object.entries(def.funcs)) {
        for (let i = 0; i < func.length; i++) {
          const wfunc = manager.getFunc(func[i]);
          if (!wfunc) throw new CompilerError('Wasm', 'Trying to export not processed function');
          module.export(`${def.name}${name ? '_' + name : ''}${i}`, wfunc.funcIdx);
        }
      }
    }
    return module.code;
  }
}