import { FeatureError, ParserError } from '../errors.ts';
import {
  sapp, parser, ModuleResolutionEnv, FetchedInstanceFunc, DefinitionBuilder
} from './common.ts';

export class EnsuredDefinitionGenerator implements DefinitionBuilder {
  public readonly self: sapp.Type;
  private readonly functions: { [name in string]: sapp.Func[] };

  private generated: sapp.Def | undefined = undefined;
  
  constructor(
    public readonly header: sapp.DefHeader,
    private readonly env: ModuleResolutionEnv,
    private readonly def: parser.Def
  ) {
    this.self = new sapp.Type(header);
    if (def.structs.length) throw new ParserError(def.meta.line, 'Ensured definitions must have no structs');
    this.functions = {};
  }
  
  fetchFunc(route: parser.ParserRoute, inputSignature: sapp.Type[]): sapp.Func | FetchedInstanceFunc {
    const name = route.route[0] ?? ''; // Empty name method if no name provided
    const funcArr = this.functions[name];
    if (funcArr !== undefined) {
      const func = funcArr.find(x => sapp.typeArrayEquals(x.inputSignature, inputSignature));
      if (func === undefined)
        throw new ParserError(route.meta.line, `Invalid signature for function ${this.def.name}.${name}(...)`)
      if (route.route[1]) throw new FeatureError(route.meta.line, 'Function Attributes');
      return func;
    }
    return this.env.fetchFunc(route, inputSignature);
  }

  private processFuncs(): EnsuredDefinitionGenerator['functions'] {
    const preparedFuncs = this.def.functions.map(f => {
      if (!f.name) throw new ParserError(f.meta.line, 'Ensured functions must be named');
      if (f.source) throw new ParserError(f.meta.line, 'Ensured functions must be bodyless');
      if (f.struct) throw new ParserError(f.meta.line, 'Ensured functions must be instanceless');
      if (!f.output) throw new ParserError(f.meta.line, 'Ensured functions return type must be defined');
      return {
        inputSignature: f.inputs.map(p => this.env.resolveType(p.type)),
        outputSignature: this.env.resolveType(f.output),
        meta: f.meta,
        source: [this.def.name, f.name]
      };
    }) satisfies sapp.Func[];
    for (const func of preparedFuncs) {
      if (func.source[1] in this.functions) {
        if (this.functions[func.source[1]].find(
          x => x.inputSignature.length === func.inputSignature.length &&
          x.inputSignature.every((t, i) => t.isEquals(func.inputSignature[i])))
        )
          throw new ParserError(func.meta.line, 'Repeated function signature');
        this.functions[func.source[1]].push(func);
      } else this.functions[func.source[1]] = [func];
    }
    return this.functions;
  }

  build(): sapp.Def {
    if (!this.generated) this.generated = {
      ...this.header,
      funcs: this.processFuncs(),
      instanceFuncs: {},
      instanceOverloads: 0
    }
    return this.generated;
  }
}