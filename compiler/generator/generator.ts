import { sapp, parser, DefinitionBuilder, ModuleEnv } from './common.ts';
import { Parser } from '../parser/parser.ts';
import { TokenList } from '../parser/tokenizer.ts';
import { ModuleGenerator } from "./module.ts";
import { DependencyError } from '../errors.ts';
import { DefinitionGenerator } from './definition.ts';
import { EnsuredDefinitionGenerator } from './ensured_definition.ts';
import { ModuleInspector, DefInspector } from './inspector.ts';

export interface ModuleProvider {
  getRoute(descriptor: sapp.ModuleDescriptor): sapp.ModuleRoute;
  getModule(descriptor: sapp.ModuleDescriptor, generator: Generator): sapp.Module;
}

export class Generator {
  private readonly inProgressModules: Set<sapp.ModuleRoute> = new Set();
  private readonly storedModules: Map<sapp.ModuleRoute, sapp.Module> = new Map();

  constructor(private readonly provider?: ModuleProvider, private kernel?: sapp.Module) { }

  overwriteKernel(kernel: sapp.Module | null) {
    this.kernel = kernel ?? undefined;
  }

  private makeGlobals(dependencies: parser.Import[]): Map<string, ModuleEnv> {
    const globals: Map<string, ModuleEnv> = new Map();
    if (this.kernel)
      this.kernel.defs.forEach((v,k) => globals.set(k, new DefInspector(v)));
    for (const imp of dependencies) {
      const module = this.generateKnownModule(imp.route);
      if (imp.mode !== 'into') globals.set(imp.name, new ModuleInspector(module));
      else for (const [name, def] of module.defs)
        globals.set(name, new DefInspector(def));
    }
    return globals;
  }

  generateKnownModule(descriptor: sapp.ModuleDescriptor): sapp.Module {
    if (this.provider === undefined) throw new DependencyError('Importing is not allowed');
    const route = this.provider.getRoute(descriptor);
    if (this.inProgressModules.has(route)) throw new DependencyError(`Circular dependency trying to import ${route}`);
    if (!this.storedModules.has(route)) {
      this.inProgressModules.add(route);
      const module = this.provider.getModule(descriptor, this);
      this.storedModules.set(route, module);
      this.inProgressModules.delete(route);
    }
    return this.storedModules.get(route) as sapp.Module;
  }

  private definitionBuilderFor(
    header: sapp.DefHeader, env: ModuleEnv, def: Parser['definitions'][number]
  ): DefinitionBuilder {
    if (def.ensured) return new EnsuredDefinitionGenerator(header, env, def);
    else return new DefinitionGenerator(header, env, def);
  }

  generateModule(route: sapp.ModuleRoute, source: TokenList | string): sapp.Module {
    const parser = new Parser(typeof source === 'string' ? { source } : { tokens: source });
    parser.parse();
    const generator = new ModuleGenerator(this.makeGlobals(parser.dependencies));
    for (const def of parser.definitions){
      const builder = this.definitionBuilderFor({ route, name: def.name }, generator, def);
      generator.set(def.name, builder, { exported: def.exported });
    }
    return generator.build(route);
  }
}