import { ResolutionEnv, sapp, parser, FetchedInstanceFunc } from "./common.ts";
import { DefinitionGenerator } from "./definition.ts";
import { ParserError } from "../errors.ts";

export class ModuleGenerator implements ResolutionEnv {
  private readonly defs: { [name in string]: DefinitionGenerator };
  private processed: sapp.Module | undefined = undefined;

  constructor(
    private readonly globals: Map<string, sapp.GlobalObject>,
    private readonly route: sapp.ModuleRoute,
    defs: parser.Def[]
  ) {
    this.defs = Object.fromEntries(defs.map(x => [x.name, new DefinitionGenerator(route, this, x)]));
  }

  resolveType(raw: parser.Type): sapp.Type {
    const array = raw.array ? (raw.array.size !== undefined ? raw.array.size : sapp.ArraySizeAuto) : undefined;
    if (raw.base === 'void') return new sapp.Type(raw.base, { array });
    if ('type' in raw.base) {
      const native: sapp.NativeType = {
        'string': 'string', 'bool': 'bool', 'int': 'i32', 'float': 'f32'
      }[raw.base.type] as sapp.NativeType;
      return new sapp.Type(native, { array });
    }
    if (Array.isArray(raw.base)) return new sapp.Type(raw.base.map(this.resolveType.bind(this)), { array });
    if (this.defs[raw.base.route[0]]) {
      if (raw.base.route.length > 1)
        throw new ParserError(raw.base.meta.line, 'Functions as types are not supported');
      return new sapp.Type(this.defs[raw.base.route[0]].generate(), { array });
    }
    const rootval = raw.base.route[0];
    if (sapp.isNativeType(rootval)) {
      if (raw.base.route.length > 1)
        throw new ParserError(raw.base.meta.line, `${rootval} is a native type with no functions`);
      return new sapp.Type(rootval, { array });
    }
    const root = this.globals.get(rootval);
    if (!root) throw new ParserError(raw.base.meta.line, `Not found: ${rootval}`);
    if ('defs' in root) {
      if (raw.base.route.length === 1) throw new ParserError(raw.base.meta.line, 'Module cannot be used as type');
      const def = root.defs[raw.base.route[1]];
      if (raw.base.route.length > 2) throw new ParserError(raw.base.meta.line, 'Function as types are not supported');
      return new sapp.Type(def, { array });
    } else if ('name' in root) {
      if (raw.base.route.length > 1) throw new ParserError(raw.base.meta.line, 'Function as types are not supported');
      return new sapp.Type(root, { array });
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
      def = r.defs[route.route[i]];
      i++;
    }
    const name = route.route[i] === undefined ? "" : route.route[i];
    const f = (def as sapp.Def).getFunc(name, inputSignature);
    if (f === undefined)
      throw new ParserError(route.meta.line, (def as sapp.Def).name + (name ? `.${name}` : '') + ' cannot be called');
    if (route.route[i + 1] !== undefined) throw new ParserError(route.meta.line, 'Function has no property');
    return f;
  }

  get module(): sapp.Module {
    if (this.processed === undefined)
      this.processed = {
        route: this.route,
        defs: Object.fromEntries(Object.entries(this.defs).map(([n, d]) => [n, d.generate()]))
      };
    return this.processed;
  }
}