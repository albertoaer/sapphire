import { ModuleEnv, sapp, FetchedInstanceFunc, DefinitionBuilder, NameRoute } from "./common.ts";
import { ParserError } from "../errors.ts";

export type DefConfig = { exported: boolean }

export class ModuleGenerator extends ModuleEnv {
  private processed: sapp.Module | undefined = undefined;
  private readonly defs: Map<string, DefinitionBuilder> = new Map();
  private readonly saw: Set<DefinitionBuilder> = new Set();
  private readonly exported: DefinitionBuilder[] = [];

  constructor(private readonly globals: Map<string, ModuleEnv>) {
    super();
  }

  fetchDef(name: NameRoute): sapp.Def {
    const id = name.next;
    if (this.defs.has(id)) {
      if (name.isNext) throw new ParserError(name.line, 'Trying to fetch def, no inner property');
      return this.defs.get(id)!.build();
    }
    const global = this.globals.get(id);
    if (!global) throw new ParserError(name.line, `Symbol not found: ${id}`);
    return global.fetchDef(name);
  }

  fetchFunc(name: NameRoute, inputSignature: sapp.Type[]): sapp.Func | FetchedInstanceFunc {
    const id = name.next;
    if (this.defs.has(id)) {
      const def = this.defs.get(id)!;
      if (!this.saw.has(def)) {
        this.saw.add(def);
        def.build();
      }
      return def.fetchFunc(name, inputSignature);
    }
    const global = this.globals.get(id);
    if (!global) throw new ParserError(name.line, `Symbol not found, ${id}`);
    return global.fetchFunc(name, inputSignature);
  }

  set(name: string, def: DefinitionBuilder, config: DefConfig) {
    // TODO: Avoid repeated definitions
    this.defs.set(name, def);
    if (config.exported) this.exported.push(def);
  }

  build(route: sapp.ModuleRoute): sapp.Module {
    if (this.processed === undefined)
      this.processed = {
        route,
        defs: new Map(Array.from(this.defs.entries(), ([n, d]) => {
          this.saw.add(d);
          return [n, d.build()];
        })),
        exports: this.exported.map(x => x.build())
      };
    return this.processed;
  }
}