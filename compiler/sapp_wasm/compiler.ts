import * as path from 'https://deno.land/std@0.177.0/path/mod.ts';
import { convertToWasmType, wasm } from './common.ts';
import { Generator } from '../generator/generator.ts';
import { Kernel } from './env/kernel.ts';
import type { Compiler } from '../compiler.ts';
import { ExpressionCompiler } from './expression.ts';
import { FunctionCollector } from './functions.ts';
import { EnvironmentInjector } from './env/mod.ts';
import { CompilerError } from '../errors.ts';
import { MemoryHelper } from './memory.ts';
import { constants as vmc } from '../wasm_vm/mod.ts';
import { ModuleProvider } from '../module_provider.ts';
import { ModuleGenerator } from '../module_generator.ts';
import { WasmExpression } from '../wasm/expressions.ts';

export class WasmCompiler implements Compiler {
  createGenerator(): ModuleGenerator {
    return new Generator(Kernel);
  }

  async compile(provider: ModuleProvider, file: string): Promise<Uint8Array> {
    // The first module route must be correctly generated
    const modroute: `file:${string}` = `file:${path.isAbsolute(file) ? file : path.join(Deno.cwd(), file)}`;
    const filename = path.basename(file);
    const generated = await provider.getModule(modroute, [filename]);
    const module = new wasm.WasmModule();
    module.configureMemory({
      limits: { min: 1 },
      import: { mod: vmc.KernelImportName, name: vmc.MemoryName }
    });
    const memory = new MemoryHelper(
      module.import(vmc.KernelImportName, vmc.AllocFnName, [wasm.WasmType.I32], [wasm.WasmType.I32])
    );
    const injector = new EnvironmentInjector();
    const collector = new FunctionCollector(module, injector);
    for (const def of generated.exports.values())
      collector.populate(Array.from(def.funcs.values()).flat());
    
    const manager = collector.manager;

    for (const func of collector)
      func.build((source, locals) => {
        const isRecursive = func.ownedFunc.isRecursive;
        const exprCompiler = new ExpressionCompiler(manager, locals, memory, 0);
        exprCompiler.submit(source);
        let expr = exprCompiler.expression;
        if (isRecursive)
          expr = new WasmExpression().pushLoop(expr, source.type.isVoid ? null : convertToWasmType(source.type));
        return expr.code;
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