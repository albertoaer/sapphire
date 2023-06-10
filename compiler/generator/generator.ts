import { sapp, parser, Global, DefinitionBuilder, ModuleEnv } from './common.ts';
import { Parser } from '../parser/parser.ts';
import { TokenList } from '../parser/tokenizer.ts';
import { ModuleGenerator } from "./module.ts";
import { DependencyError } from '../errors.ts';
import { ModuleInspector, DefInspector } from './inspector.ts';
import { EnsuredDefinitionGenerator } from './ensured_definition.ts';
import { DefinitionGenerator } from "./definition.ts";
import { ModuleProvider } from '../module_provider.ts';

interface GeneratedEnv {
  globals: Map<string, Global>,
  exported: sapp.Def[]
}

export class Generator {
  private readonly inProgressModules: Set<sapp.ModuleRoute> = new Set();
  private readonly storedModules: Map<sapp.ModuleRoute, sapp.Module> = new Map();

  constructor(private kernel?: sapp.Module) { }

  overwriteKernel(kernel: sapp.Module | null) {
    this.kernel = kernel ?? undefined;
  }

  private async generateKnownModule(
    requester: sapp.ModuleRoute, descriptor: sapp.ModuleDescriptor, provider: ModuleProvider
  ): Promise<sapp.Module> {
    const route = await provider.getRoute(requester, descriptor);

    if (this.inProgressModules.has(route))
      throw new DependencyError(`Circular dependency trying to import ${route}`);
      
    if (!this.storedModules.has(route)) {
      this.inProgressModules.add(route);
      const module = await provider.getModule(requester, descriptor);
      this.storedModules.set(route, module);
      this.inProgressModules.delete(route);
    }
    return this.storedModules.get(route) as sapp.Module;
  }

  async generateModule(
    route: sapp.ModuleRoute, source: TokenList | string, provider: ModuleProvider
  ): Promise<sapp.Module> {
    const parser = new Parser(typeof source === 'string' ? { source } : { tokens: source });
    parser.parse();
    
    const { globals, exported } = await this.generateEnv(route, parser.dependencies, provider);
    
    const generator = new ModuleGenerator(globals);

    for (const def of parser.definitions)
      generator.set(
        def.name,
        this.createDefinitionBuilder(def, generator, route),
        { exported: def.exported }
      );
      
    const builded = generator.build(route);
    for (const def of exported)
      builded.exports.push(def);

    return builded;
  }

  private createDefinitionBuilder(parsed: parser.Def, env: ModuleEnv, route: sapp.ModuleRoute): DefinitionBuilder {
    if (parsed.ensured) return new EnsuredDefinitionGenerator(route, env, parsed);
    else return new DefinitionGenerator(route, env, parsed);
  }

  private async generateEnv(
    requester: sapp.ModuleRoute, dependencies: parser.Import[], provider: ModuleProvider
  ): Promise<GeneratedEnv> {
    const globals: Map<string, Global> = new Map();
    const exported: sapp.Def[] = [];

    if (this.kernel) {
      this.kernel.defs.forEach((v,k) => globals.set(k, new DefInspector(v)));
      globals.set('kernel', new ModuleInspector(this.kernel));
    }
    for (const imp of dependencies) {
      const module = await this.generateKnownModule(requester, imp.route, provider);
      if (imp.mode === 'named') globals.set(imp.name, new ModuleInspector(module));
      else {
        for (const [name, def] of module.defs) {
          globals.set(name, new DefInspector(def));
        }
        if (imp.mode === 'export_into') for (const def of module.exports) {
          exported.push(def);
        }
      }
    }
    return { globals, exported };
  }
}