import { FeatureError, ParserError } from '../errors.ts';
import {
  sapp, parser, FetchedInstanceFunc, DefinitionBuilder, NameRoute, ModuleEnv
} from './common.ts';

export class EnsuredDefinitionGenerator implements DefinitionBuilder {
  public readonly self: sapp.Type;
  private readonly functions: Map<string, sapp.Func[]> = new Map();

  private generated: sapp.Def | undefined = undefined;
  
  constructor(
    public readonly header: sapp.DefHeader,
    private readonly env: ModuleEnv,
    private readonly def: parser.Def
  ) {
    this.self = new sapp.Type(header);
    if (def.structs.length) throw new ParserError(def.meta.line, 'Ensured definitions must have no structs');
    if (def.extensions.length) throw new ParserError(def.meta.line, 'Ensured definitions must have no extensions');
  }
  
  fetchFunc(name: NameRoute, inputSignature: sapp.Type[]): sapp.Func | FetchedInstanceFunc {
    const funcArr = this.functions.get(name.isNext ? name.next : ''); // Empty name method if no name provided
    if (funcArr) {
      const func = funcArr.find(x => sapp.typeArrayEquals(x.inputSignature, inputSignature));
      if (!func)
        throw new ParserError(name.line, `Invalid signature for function ${this.def.name}.${name}(...)`)
      if (name.isNext) throw new FeatureError(name.line, 'Function Attributes');
      return func;
    }
    return this.env.fetchFunc(name, inputSignature);
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
      if (this.functions.has(func.source[1])) {
        if (this.functions.get(func.source[1])!.find(
          x => x.inputSignature.length === func.inputSignature.length &&
          x.inputSignature.every((t, i) => t.isEquals(func.inputSignature[i])))
        )
          throw new ParserError(func.meta.line, 'Repeated function signature');
        this.functions.get(func.source[1])!.push(func);
      } else this.functions.set(func.source[1], [func]);
    }
    return this.functions;
  }

  build(): sapp.Def {
    if (!this.generated) this.generated = {
      ...this.header,
      funcs: this.processFuncs(),
      instanceFuncs: new Map(),
      instanceOverloads: 0
    }
    return this.generated;
  }
}