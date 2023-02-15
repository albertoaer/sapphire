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
  moduleRelations: number[][] = [];
  inProgressModules: Set<sapp.ModuleRoute> = new Set();
  storedModules: Map<sapp.ModuleRoute, sapp.Module> = new Map();

  constructor(private readonly io: IOParserSupport) {}

  private preventRepeatedName(globals: Map<string, sapp.GlobalObject>, name: string) {
    if (globals.has(name))
      throw new DependencyError(`Global ${name} declared twice`);
  }

  private makeGlobals(dependencies: Import[]): Map<string, sapp.GlobalObject> {
    const globals: Map<string, sapp.GlobalObject> = new Map();
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

  parseModule = (descriptor: sapp.ModuleDescriptor): sapp.Module => {
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