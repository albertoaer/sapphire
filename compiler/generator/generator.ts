import { sapp, parser, Global } from './common.ts';
import { Parser } from '../parser/parser.ts';
import { TokenList } from '../parser/tokenizer.ts';
import { ModuleGenerator } from "./module.ts";
import { DependencyError } from '../errors.ts';
import { ModuleInspector, DefInspector } from './inspector.ts';
import { DefaultDefFactory } from './factory.ts';

export interface ModuleProvider {
  getRoute(requester: sapp.ModuleRoute, descriptor: sapp.ModuleDescriptor): sapp.ModuleRoute;
  getModule(requester: sapp.ModuleRoute, descriptor: sapp.ModuleDescriptor, generator: Generator): sapp.Module;
}

export class Generator {
  private readonly inProgressModules: Set<sapp.ModuleRoute> = new Set();
  private readonly storedModules: Map<sapp.ModuleRoute, sapp.Module> = new Map();

  constructor(private readonly provider?: ModuleProvider, private kernel?: sapp.Module) { }

  overwriteKernel(kernel: sapp.Module | null) {
    this.kernel = kernel ?? undefined;
  }

  private makeGlobals(requester: sapp.ModuleRoute, dependencies: parser.Import[]): Map<string, Global> {
    const globals: Map<string, Global> = new Map();
    if (this.kernel) {
      this.kernel.defs.forEach((v,k) => globals.set(k, new DefInspector(v)));
      globals.set('kernel', new ModuleInspector(this.kernel));
    }
    for (const imp of dependencies) {
      const module = this.generateKnownModule(requester, imp.route);
      if (imp.mode !== 'into') globals.set(imp.name, new ModuleInspector(module));
      else for (const [name, def] of module.defs)
        globals.set(name, new DefInspector(def));
    }
    return globals;
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
    const generator = new ModuleGenerator(this.makeGlobals(route, parser.dependencies));
    const builderFactory = new DefaultDefFactory(generator, route);
    for (const def of parser.definitions)
      generator.set(def.name, builderFactory.create(def), { exported: def.exported });
    return generator.build(route);
  }
}