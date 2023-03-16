import { ModuleEnv, sapp, FetchedFuncResult, DefinitionBuilder, NameRoute } from "./common.ts";

export type DefConfig = { exported: boolean }

export class ModuleGenerator extends ModuleEnv {
  private generated: sapp.Module | undefined = undefined;
  private readonly defs: Map<string, DefinitionBuilder> = new Map();
  private readonly exported: DefinitionBuilder[] = [];

  constructor(
    private readonly globals: Map<string, ModuleEnv>
  ) {
    super();
  }

  private localDef(id: string): DefinitionBuilder | undefined {
    const def = this.defs.get(id);
    if (def) {
      def.build();
      return def;
    }
  }

  fetchDef(name: NameRoute): sapp.Def {
    const id = name.next;
    const def = this.localDef(id);
    if (def) {
      if (name.isNext) throw name.meta.error('Trying to fetch def, no inner property');
      return def.def;
    }
    const global = this.globals.get(id);
    if (!global) throw name.meta.error(`Symbol not found: ${id}`);
    return global.fetchDef(name);
  }

  fetchFunc(name: NameRoute, inputSignature: sapp.Type[]): FetchedFuncResult {
    if (name.isNext) {
      const id = name.next;
      const def = this.localDef(id);
      if (def) return def.fetchFunc(name, inputSignature);
      const global = this.globals.get(id);
      if (!global) throw name.meta.error(`Symbol not found, ${id}`);
      return global.fetchFunc(name, inputSignature);
    }
  }

  set(name: string, def: DefinitionBuilder, config: DefConfig) {
    // TODO: Avoid repeated definitions
    this.defs.set(name, def);
    if (config.exported) this.exported.push(def);
  }

  build(route: sapp.ModuleRoute): sapp.Module {
    if (this.generated === undefined)
      this.generated = {
        route,
        defs: new Map(Array.from(this.defs.entries()).filter(([_, d]) => !d.isPrivate).map(([n, d]) => {
          d.build();
          return [n, d.def];
        })),
        exports: this.exported.map(x => x.def)
      };
    return this.generated;
  }
}