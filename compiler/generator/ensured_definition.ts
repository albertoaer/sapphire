import { ParserError } from '../errors.ts';
import {
  sapp, parser, FetchedFuncResult, DefinitionBuilder, NameRoute, ModuleEnv
} from './common.ts';

export class EnsuredDefinitionGenerator implements sapp.Def, DefinitionBuilder {
  public readonly self: sapp.Type;
  public readonly def: sapp.Def = this;
  public readonly instanceOverloads = 0;
  public readonly isPrivate: boolean;
  public readonly funcs: Map<string, sapp.Func[]> = new Map();
  public readonly instanceFuncs: Map<string, sapp.Func[][]> = new Map();
  private built: boolean;

  private generated: sapp.Def | undefined = undefined;
  
  constructor(
    public readonly route: sapp.ModuleRoute,
    public readonly name: string,
    private readonly env: ModuleEnv,
    private readonly parsedDef: parser.Def
  ) {
    this.self = new sapp.Type(this);
    this.isPrivate = parsedDef.private;
    if (parsedDef.structs.length)
      throw new ParserError(parsedDef.meta.line, 'Ensured definitions must have no structs');
    if (parsedDef.extensions.length)
      throw new ParserError(parsedDef.meta.line, 'Ensured definitions must have no extensions');
    this.built = false;
  }
  
  fetchFunc(name: NameRoute, inputSignature: sapp.Type[]): FetchedFuncResult {
    const id = name.isNext ? name.next : '';
    const funcArr = this.funcs.get(id); // Empty name method if no name provided
    if (funcArr) {
      const func = funcArr.find(x => sapp.typeArrayEquals(x.inputSignature, inputSignature));
      if (!func) return 'mismatch';
      if (name.isNext) throw name.meta.error('Function Attributes');
      return func;
    }
  }

  private processFuncs() {
    const preparedFuncs = this.parsedDef.functions.map(f => {
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
      if (this.funcs.has(func.source[1])) {
        if (this.funcs.get(func.source[1])!.find(
          x => x.inputSignature.length === func.inputSignature.length &&
          x.inputSignature.every((t, i) => t.isEquals(func.inputSignature[i])))
        )
          throw new ParserError(func.meta.line, 'Repeated function signature');
        this.funcs.get(func.source[1])!.push(func);
      } else this.funcs.set(func.source[1], [func]);
    }
  }

  build() {
    if (!this.built) {
      this.built = true;
      this.processFuncs();
    }
  }
}