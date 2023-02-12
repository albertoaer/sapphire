import { ResolutionEnv, sapp, parser, ParserError } from "./common.ts";
import { DefinitionGenerator } from "./definition_generator.ts";

export class ModuleGenerator implements ResolutionEnv {
  private readonly defs: { [name in string]: DefinitionGenerator };
  private processed: sapp.Module | undefined = undefined;

  constructor(
    private readonly globals: Map<string, sapp.Object>,
    private readonly route: sapp.ModuleRoute,
    defs: parser.Def[]
  ) {
    this.defs = Object.fromEntries(defs.map(x => [x.name, new DefinitionGenerator(route, this, x)]));
  }

  resolveType(raw: parser.Type): sapp.Type {
    const arr = raw.array ? (raw.array.size !== undefined ? raw.array.size : sapp.ArraySizeAuto) : undefined;
    if (raw.base === 'void') return new sapp.Type(raw.base, arr);
    if ('type' in raw.base) {
      const native: sapp.NativeType = {
        'string': 'string', 'bool': 'bool', 'int': 'i32', 'float': 'f32'
      }[raw.base.type] as sapp.NativeType;
      return new sapp.Type(native, arr);
    }
    if (Array.isArray(raw.base)) return new sapp.Type(raw.base.map(this.resolveType.bind(this)), arr);
    if (this.defs[raw.base.route[0]]) {
      if (raw.base.route.length > 1) throw new ParserError(raw.base.meta.line, 'Functions as types are not supported');
      return new sapp.Type(this.defs[raw.base.route[0]].generate(), arr);
    }
    const rootval = raw.base.route[0];
    if (sapp.isNativeType(rootval)) {
      if (raw.base.route.length > 1)
        throw new ParserError(raw.base.meta.line, `${rootval} is a native type with no functions`);
      return new sapp.Type(rootval, arr);
    }
    const root = this.globals.get(rootval);
    if (!root) throw new ParserError(raw.base.meta.line, `Not found: ${rootval}`);
    if ('defs' in root) {
      if (raw.base.route.length === 1) throw new ParserError(raw.base.meta.line, 'Module cannot be used as type');
      const def = root.defs[raw.base.route[1]];
      if (raw.base.route.length > 2) throw new ParserError(raw.base.meta.line, 'Function as types are not supported');
      return new sapp.Type(def, arr);
    } else if ('name' in root) {
      if (raw.base.route.length > 1) throw new ParserError(raw.base.meta.line, 'Function as types are not supported');
      return new sapp.Type(root, arr);
    }
    throw new ParserError(raw.base.meta.line, `Cannot be used as type: ${rootval}`);
  }

  getObject(route: parser.ParserRoute): sapp.Object {
    throw new Error('todo');
  }

  get module(): sapp.Module {
    if (this.processed === undefined) {      
      const defs = Object.fromEntries(Object.entries(this.defs).map(([n, d]) => [n, d.generate()]));

      this.processed = { route: this.route, defs }
    }
    return this.processed;
  }
}