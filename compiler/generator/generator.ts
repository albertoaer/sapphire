import { sapp, parser, Global, DefinitionBuilder, ModuleEnv } from './common.ts';
import { Parser } from '../parser/parser.ts';
import { TokenList } from '../parser/tokenizer.ts';
import { ModuleGenerator } from "./module.ts";
import { DependencyError } from '../errors.ts';
import { ModuleInspector, DefInspector } from './inspector.ts';
import { EnsuredDefinitionGenerator } from './ensured_definition.ts';
import { DefinitionGenerator } from "./definition.ts";

export interface ModuleProvider {
  getRoute(requester: sapp.ModuleRoute, descriptor: sapp.ModuleDescriptor): sapp.ModuleRoute;
  getModule(requester: sapp.ModuleRoute, descriptor: sapp.ModuleDescriptor, generator: Generator): sapp.Module;
}

interface GeneratedEnv {
  globals: Map<string, Global>,
  exported: Map<string, sapp.Def>
}

export class Generator {
  private readonly inProgressModules: Set<sapp.ModuleRoute> = new Set();
  private readonly storedModules: Map<sapp.ModuleRoute, sapp.Module> = new Map();

  constructor(private readonly provider?: ModuleProvider, private kernel?: sapp.Module) { }

  overwriteKernel(kernel: sapp.Module | null) {
    this.kernel = kernel ?? undefined;
  }

  generateKnownModule(requester: sapp.ModuleRoute, descriptor: sapp.ModuleDescriptor): sapp.Module {
    if (this.provider === undefined)
      throw new DependencyError('Importing is not allowed');

    const route = this.provider.getRoute(requester, descriptor);

    if (this.inProgressModules.has(route))
      throw new DependencyError(`Circular dependency trying to import ${route}`);
      
    if (!this.storedModules.has(route)) {
      this.inProgressModules.add(route);
      const module = this.provider.getModule(requester, descriptor, this);
      this.storedModules.set(route, module);
      this.inProgressModules.delete(route);
    }
    return this.storedModules.get(route) as sapp.Module;
  }

  generateModule(route: sapp.ModuleRoute, source: TokenList | string): sapp.Module {
    const parser = new Parser(typeof source === 'string' ? { source } : { tokens: source });
    parser.parse();
    
    const { globals, exported } = this.generateEnv(route, parser.dependencies);
    
    const generator = new ModuleGenerator(globals);

    for (const def of parser.definitions)
      generator.set(
        def.name,
        this.createDefinitionBuilder(def, generator, route),
        { exported: def.exported }
      );
      
    const builded = generator.build(route);
    for (const [name, value] of exported)
      if (!builded.defs.has(name))
        builded.defs.set(name, value);

    return builded;
  }

  private createDefinitionBuilder(parsed: parser.Def, env: ModuleEnv, route: sapp.ModuleRoute): DefinitionBuilder {
    if (parsed.ensured) return new EnsuredDefinitionGenerator(route, env, parsed);
    else return new DefinitionGenerator(route, env, parsed);
  }

  private generateEnv(requester: sapp.ModuleRoute, dependencies: parser.Import[]): GeneratedEnv {
    const globals: Map<string, Global> = new Map();
    const exported: Map<string, sapp.Def> = new Map();

    if (this.kernel) {
      this.kernel.defs.forEach((v,k) => globals.set(k, new DefInspector(v)));
      globals.set('kernel', new ModuleInspector(this.kernel));
    }
    for (const imp of dependencies) {
      const module = this.generateKnownModule(requester, imp.route);
      if (imp.mode === 'named') globals.set(imp.name, new ModuleInspector(module));
      else {
        for (const [name, def] of module.defs) {
          globals.set(name, new DefInspector(def));
        }
        if (imp.mode === 'export_into') for (const [name, def] of module.defs) {
          exported.set(name, def);
        }
      }
    }
    return { globals, exported };
  }
}