import { sapp, parser, DefinitionBuilder, ModuleResolutionEnv } from './common.ts';
import { Parser } from '../parser/parser.ts';
import { TokenList } from '../parser/tokenizer.ts';
import { ModuleGenerator } from "./module.ts";
import { DependencyError, FeatureError } from '../errors.ts';
import { DefinitionGenerator } from './definition.ts';

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

  private definitionBuilderFor(
    header: sapp.DefHeader, env: ModuleResolutionEnv, def: Parser['definitions'][number]
  ): DefinitionBuilder {
    if (def.ensured) throw new FeatureError(def.meta.line, 'Ensured Definitions');
    else return new DefinitionGenerator(header, env, def);
  }

  generateModule(route: sapp.ModuleRoute, source: TokenList | string): sapp.Module {
    const parser = new Parser(typeof source === 'string' ? { source } : { tokens: source });
    parser.parse();
    const generator = new ModuleGenerator(this.makeGlobals(parser.dependencies));
    for (const def of parser.definitions)
      generator.set(def.name, this.definitionBuilderFor({ route, name: def.name }, generator, def));
    return generator.build(route);
  }
}