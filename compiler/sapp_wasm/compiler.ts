import { wasm } from './common.ts';
import { Generator, ModuleProvider } from '../generator/generator.ts';
import { Kernel } from './env/kernel.ts';
import type { Compiler } from '../compiler.ts';
import { ExpressionCompiler } from './expression.ts';
import { FunctionCollector } from './functions.ts';
import { EnvironmentInjector } from './env/mod.ts';
import { CompilerError } from '../errors.ts';
import { MemoryHelper } from './memory.ts';

export class WasmCompiler implements Compiler {
  constructor(private readonly provider: ModuleProvider) { }

  compile(file: string): Uint8Array {
    const generator = new Generator(this.provider, Kernel);
    const generated = generator.generateKnownModule([file]);
    const module = new wasm.WasmModule();
    const memory = new MemoryHelper(module);
    const injector = new EnvironmentInjector();
    const collector = new FunctionCollector(module, injector);
    for (const def of generated.exports.values())
      collector.populate(Array.from(def.funcs.values()).flat());
    
    const manager = collector.manager;

    for (const func of collector)
      func.build(source => {
        const expr = new ExpressionCompiler(manager, memory);
        expr.submit(source);
        return expr.expression.code;
      });
    for (const def of generated.exports) {
      for (const [name, func] of def.funcs) {
        for (let i = 0; i < func.length; i++) {
          const exported = manager.useFunc(func[i]);
          if (typeof exported !== 'number') throw new CompilerError('Wasm', 'Exports must be pure functions');
          module.export(`${def.name}${name ? '_' + name : ''}${i}`, exported);
        }
      }
    }
    return module.code;
  }
}