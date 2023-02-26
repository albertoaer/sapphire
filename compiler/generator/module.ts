import { ModuleResolutionEnv, sapp, parser, FetchedInstanceFunc, DefinitionBuilder } from "./common.ts";
import { ParserError } from "../errors.ts";

export type DefConfig = {
  exported: boolean
}

export class ModuleGenerator implements ModuleResolutionEnv {
  private processed: sapp.Module | undefined = undefined;
  private readonly defs: { [name in string]: DefinitionBuilder } = { };
  private readonly exported: DefinitionBuilder[] = [];

  constructor(private readonly globals: Map<string, sapp.GlobalObject>) { }

  resolveType(raw: parser.Type): sapp.Type {
    const array = raw.array ? (raw.array.size !== undefined ? raw.array.size : sapp.ArraySizeAuto) : undefined;
    if ('type' in raw.base) {
      const base = {
        'string': sapp.String, 'bool': sapp.Bool, 'int': sapp.I32, 'float': sapp.F32
      }[raw.base.type].base;
      return new sapp.Type(base, array);
    }
    if (Array.isArray(raw.base)) return new sapp.Type(raw.base.map(this.resolveType.bind(this)), array);
    if (raw.base.route.length === 1 && raw.base.route[0] === 'void') return sapp.Void;
    if (raw.base.route.length === 1 && raw.base.route[0] === 'any') return sapp.Any;
    
    if (this.defs[raw.base.route[0]]) {
      if (raw.base.route.length > 1)
        throw new ParserError(raw.base.meta.line, 'Functions as types are not supported');
      return new sapp.Type(this.defs[raw.base.route[0]].self, array);
    }

    const rootval = raw.base.route[0];
    if (sapp.isNativeType(rootval)) {
      if (raw.base.route.length > 1)
        throw new ParserError(raw.base.meta.line, `${rootval} is a native type with no functions`);
      return new sapp.Type(rootval, array);
    }
    const root = this.globals.get(rootval);
    if (!root) throw new ParserError(raw.base.meta.line, `Not found: ${rootval}`);
    if ('defs' in root) {
      if (raw.base.route.length === 1) throw new ParserError(raw.base.meta.line, 'Module cannot be used as type');
      const def = root.defs[raw.base.route[1]];
      if (!def) throw new ParserError(raw.base.meta.line, `Not found: ${raw.base.route[1]} in ${root.route}`);
      if (raw.base.route.length > 2) throw new ParserError(raw.base.meta.line, 'Function as types are not supported');
      return new sapp.Type(def, array);
    } else if ('name' in root) {
      if (raw.base.route.length > 1) throw new ParserError(raw.base.meta.line, 'Function as types are not supported');
      return new sapp.Type(root, array);
    }
    throw new ParserError(raw.base.meta.line, `Cannot be used as type: ${rootval}`);
  }

  fetchFunc(route: parser.ParserRoute, inputSignature: sapp.Type[]): sapp.Func | FetchedInstanceFunc {
    if (route.route[0] === undefined) throw new ParserError(route.meta.line, 'Empty route');
    
    if (route.route[0] in this.defs)
      return this.defs[route.route[0]].fetchFunc(
        { route: route.route.slice(1), meta: route.meta }, inputSignature
      );
    
    const r = this.globals.get(route.route[0]);
    if (!r) throw new ParserError(route.meta.line, `Symbol not found: ${route.route[0]}`);
    let def = r;
    let i = 1;
    if ('defs' in r) {
      if (route.route[i] === undefined) throw new ParserError(route.meta.line, 'Module cannot be called');
      const item = r.defs[route.route[i]];
      if (!item) throw new ParserError(route.meta.line, `Not found: ${route.route[1]} in ${def.route}`);
      def = item;
      i++;
    }
    const name = route.route[i] === undefined ? "" : route.route[i];
    const f = (def as sapp.Def).funcs[name]?.find(
      x => sapp.typeArrayEquals(x.inputSignature, inputSignature)
    );
    if (f === undefined)
      throw new ParserError(route.meta.line, (def as sapp.Def).name + (name ? `.${name}` : '') + ' cannot be called');
    if (route.route[i + 1] !== undefined) throw new ParserError(route.meta.line, 'Function has no property');
    return f;
  }

  set(name: string, def: DefinitionBuilder, config: DefConfig) {
    // TODO: Avoid repeated definitions
    this.defs[name] = def;
    if (config.exported) this.exported.push(def);
  }

  build(route: sapp.ModuleRoute): sapp.Module {
    if (this.processed === undefined)
      this.processed = {
        route,
        defs: Object.fromEntries(Object.entries(this.defs).map(([n, d]) => [n, d.build()])),
        exports: this.exported.map(x => x.build())
      };
    return this.processed;
  }
}