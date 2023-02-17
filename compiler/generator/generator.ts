import { sapp, parser } from './common.ts';
import { Parser } from '../parser/parser.ts';
import { TokenList } from '../parser/tokenizer.ts';
import { ModuleGenerator } from "./module.ts";
import { DependencyError } from '../errors.ts';

export interface ModuleProvider {
  readonly kernel?: sapp.Module;
  getRoute(descriptor: sapp.ModuleDescriptor): sapp.ModuleRoute;
  getModule(descriptor: sapp.ModuleDescriptor, generator: Generator): sapp.Module;
}

export class Generator {
  private readonly inProgressModules: Set<sapp.ModuleRoute> = new Set();
  private readonly storedModules: Map<sapp.ModuleRoute, sapp.Module> = new Map();
  private kernel: sapp.Module | undefined;

  constructor(private readonly provider?: ModuleProvider) {
    this.kernel = provider?.kernel;
  }

  overwriteKernel(kernel: sapp.Module | null) {
    this.kernel = kernel ?? undefined;
  }

  private preventRepeatedName(globals: Map<string, sapp.GlobalObject>, name: string) {
    if (globals.has(name))
      throw new DependencyError(`Global ${name} declared twice`);
  }

  private makeGlobals(dependencies: parser.Import[]): Map<string, sapp.GlobalObject> {
    const globals: Map<string, sapp.GlobalObject> = new Map();
    if (this.kernel)
      Object.entries(this.kernel.defs).forEach(([k,v]) => globals.set(k, v));
    for (const imp of dependencies) {
      const module = this.generateKnownModule(imp.route);
      if (imp.mode === 'into') {
        for (const [name, def] of Object.entries(module.defs)) {
          this.preventRepeatedName(globals, name);
          globals.set(name, def);
        }
      } else {
        this.preventRepeatedName(globals, imp.name);
        globals.set(imp.name, module);
      }
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

  generateModule(route: sapp.ModuleRoute, source: TokenList | string): sapp.Module {
    const parser = new Parser(typeof source === 'string' ? { source } : { tokens: source });
    parser.parse();
    const generator = new ModuleGenerator(this.makeGlobals(parser.dependencies), route, parser.definitions);
    return generator.module;
  }
}