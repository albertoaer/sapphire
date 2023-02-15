import { TokenList } from './tokenizer.ts';
import { ModuleParser, Import } from './module_parser.ts';
import { ModuleGenerator } from './generator/module_generator.ts';
import * as sapp from './sapp.ts';

export interface IOParserSupport {
  solveModuleRoute(descriptor: sapp.ModuleDescriptor): sapp.ModuleRoute;
  getModuleTokens(route: sapp.ModuleRoute): TokenList;
}

class DependencyError extends Error {
  constructor(msg: string) {
    super(msg);
  }
}

export class Parser {
  private readonly inProgressModules: Set<sapp.ModuleRoute> = new Set();
  private readonly storedModules: Map<sapp.ModuleRoute, sapp.Module> = new Map();
  private readonly injectedDescriptors: [string[], sapp.ModuleRoute][] = [];
  private kernel: sapp.Module | undefined;

  constructor(private readonly io: IOParserSupport) {}

  private preventRepeatedName(globals: Map<string, sapp.GlobalObject>, name: string) {
    if (globals.has(name))
      throw new DependencyError(`Global ${name} declared twice`);
  }

  private makeGlobals(dependencies: Import[]): Map<string, sapp.GlobalObject> {
    const globals: Map<string, sapp.GlobalObject> = new Map();
    if (this.kernel) Object.entries(this.kernel.defs).forEach(([k,v]) => globals.set(k, v));
    for (const imp of dependencies) {
      const module = this.parseModule(imp.route);
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

  private tryGetInjected = (descriptor: string[]): sapp.ModuleRoute | undefined =>
    this.injectedDescriptors.find(x => x[0].every((x, i) => x === descriptor[i]))?.[1];

  injectModule(descriptor: string[], name: string, module: sapp.Module) {
    const route: sapp.ModuleRoute = `virtual:${name}`;
    if (this.storedModules.has(route))
      throw new DependencyError('Trying to inject twice with the same name');
    if (this.tryGetInjected(descriptor) !== undefined)
      throw new DependencyError('Trying to inject twice with the same descriptor');
    this.storedModules.set(route, module);
    this.injectedDescriptors.push([descriptor, route]);
  }

  provideKernel(mod: sapp.Module): void {
    this.kernel = mod
  }

  // TODO: Split into multiple functions to reduce testing complexity
  parseModule(descriptor: sapp.ModuleDescriptor): sapp.Module {
    if (Array.isArray(descriptor)) {
      const vroute = this.tryGetInjected(descriptor);
      if (vroute) {
        const mod = this.storedModules.get(vroute);
        if (mod === undefined) throw new DependencyError(`Declared virtual module is not stored: ${vroute}`);
        return mod;
      }
    }
    const route = this.io.solveModuleRoute(descriptor);
    if (this.inProgressModules.has(route)) throw new DependencyError(`Circular dependency trying to import ${route}`);
    if (!this.storedModules.has(route)) {
      this.inProgressModules.add(route);
      const parser = new ModuleParser(this.io.getModuleTokens(route));
      parser.parse();
      const generator = new ModuleGenerator(this.makeGlobals(parser.dependencies), route, parser.definitions);
      const module = generator.module;
      this.storedModules.set(route, module);
      this.inProgressModules.delete(route);
    }
    return this.storedModules.get(route) as sapp.Module;
  }
}