import {
  sapp, parser, ModuleEnv, FetchedInstanceFunc, DefinitionEnv,
  DefinitionBuilder, FunctionBuilder, NameRoute
} from './common.ts';
import { FunctionGenerator } from './function.ts';
import { FeatureError, ParserError } from '../errors.ts';

class InstanceFunction {
  // Each index is a struct
  private readonly functionsByStruct: (FunctionBuilder | undefined)[];
  private refLine: number;
  private firstIdx: number;
  public readonly isPrivate: boolean;

  constructor(
    first: { pre: parser.Func, func: FunctionBuilder, structIdx: number },
    total: number
  ) {
    this.functionsByStruct = new Array(total);
    this.refLine = first.pre.meta.line;
    this.isPrivate = first.func.isPrivate;
    this.push(first.pre, first.func, first.structIdx);
    this.firstIdx = first.structIdx;
  }

  signature(): sapp.Type[] {
    return (this.functionsByStruct[this.firstIdx] as FunctionBuilder).inputs;
  }

  push(pre: parser.Func, func: FunctionBuilder, structIdx: number) {
    if (this.isPrivate !== func.isPrivate)
      throw new ParserError(pre.meta.line, 'Protection level must be the same between instance functions');
    if (this.functionsByStruct[structIdx] !== undefined)
      throw new ParserError(pre.meta.line, 'Repeated function signature');
    this.functionsByStruct[structIdx] = func;
  }

  get functions(): sapp.Func[] {
    if (this.functionsByStruct.findIndex(x => x === undefined) >= 0)
      throw new ParserError(this.refLine, 'Signature not covered by every struct');
    const funcs = this.functionsByStruct.map(x => x!.func);
    for (let i = 1; i < funcs.length; i++)
      if (!funcs[i-1].outputSignature.isEquals(funcs[i].outputSignature))
        throw new ParserError(this.refLine, 'Return type must be the same between instance functions');
    return funcs;
  }
}

export class DefinitionGenerator extends DefinitionEnv implements DefinitionBuilder {
  private readonly structs: sapp.Type[][] = [];
  
  // Functions under a name always have different input signature
  private readonly functions: Map<string, FunctionBuilder[]> = new Map();
  private readonly instanceFunctions: Map<string, InstanceFunction[]> = new Map();

  public readonly self: sapp.Type;
  public readonly isPrivate: boolean;
  
  private generated: sapp.Def | undefined = undefined;

  constructor(
    public readonly header: sapp.DefHeader,
    private readonly env: ModuleEnv,
    private readonly def: parser.Def
  ) {
    super();
    this.self = new sapp.Type(header);
    this.isPrivate = def.private;
  }

  fetchDef(name: NameRoute): sapp.Def {
    return this.env.fetchDef(name);
  }

  structFor(types: sapp.Type[]): number | undefined {
    const idx = this.structs.findIndex(x => sapp.typeArrayEquals(x, types));
    return idx < 0 ? undefined : idx;
  }

  fetchFunc(name: NameRoute, inputSignature: sapp.Type[]): sapp.Func | FetchedInstanceFunc {
    const id = name.isNext ? name.next : '';
    const funcArr = this.functions.get(id); // Empty name method if no name provided
    if (funcArr) {
      const func = funcArr.find(x => sapp.typeArrayEquals(x.inputs, inputSignature));
      if (!func)
        throw new ParserError(name.line, `Invalid signature for function ${this.def.name}.${name}(...)`)
      if (name.isNext) throw new FeatureError(name.line, 'Function Attributes');
      return func.func;
    }
    if (id) name.discardOne();
    return this.env.fetchFunc(name, inputSignature);
  }

  private generateStruct = (pre: parser.Struct) => {
    const struct: sapp.Type[] = pre.types.map(x => this.resolveType(x));
    if (this.structs.find(x => sapp.typeArrayEquals(x, struct)))
      throw new ParserError(pre.meta.line, 'Repeated struct');
    this.structs.push(struct);
  }

  private resolveStructIndex(heuristic: parser.HeuristicList, line: number): number {
    const types = heuristic.map(x => x.type ? this.resolveType(x.type) : null);
    const factible = this.structs.map((x, i) => [x, i]  as [sapp.Type[], number]).filter(
      ([x, _]) => x.length === heuristic.length
        && x.every((t, i) => types[i] === null || t.isEquals(types[i] as sapp.Type))
    );
    if (factible.length === 0) throw new ParserError(line, 'Struct mismatch');
    if (factible.length > 1) throw new ParserError(line, 'Struct ambiguity');
    return factible[0][1];
  }
  
  private includeFunction(pre: parser.Func, func: FunctionGenerator) {
    if (!this.functions.has(pre.name)) this.functions.set(pre.name, []);
    const idx = this.functions.get(pre.name)!.findIndex(x => sapp.typeArrayEquals(x.inputs, func.inputs));
    if (idx >= 0) {
      if (pre.force) this.functions.get(pre.name)![idx] = func;
      else throw new ParserError(pre.meta.line, 'Repeated function signature');
    }
    this.functions.get(pre.name)!.push(func);
  }

  private includeInstanceFunction(pre: parser.Func, func: FunctionGenerator, structIdx: number) {
    if (pre.force) throw new ParserError(pre.meta.line, 'Force cannot be applied to instance functions');
    if (!this.instanceFunctions.has(pre.name)) this.instanceFunctions.set(pre.name, []);
    const idx = this.instanceFunctions.get(pre.name)!.findIndex(
      x => sapp.typeArrayEquals(x.signature(), func.inputs)
    );
    if (idx >= 0) this.instanceFunctions.get(pre.name)![idx].push(pre, func, structIdx);
    else this.instanceFunctions.get(pre.name)!.push(new InstanceFunction(
      { pre, func, structIdx }, this.structs.length
    ));
  }
  
  private generateFunction = (pre: parser.Func) => {
    const structIdx = pre.struct !== undefined ? this.resolveStructIndex(pre.struct, pre.meta.line) : undefined;
    const output = pre.output ? this.resolveType(pre.output) : undefined;
    const func = new FunctionGenerator(
      pre, this, pre.private, output, structIdx !== undefined ? this.structs[structIdx] : undefined
    );
    if (structIdx === undefined) this.includeFunction(pre, func)
    else this.includeInstanceFunction(pre, func, structIdx);
  }

  private extendDef = (route: parser.ParserRoute) => {
    const def = this.env.fetchDef(new NameRoute(route));
    def.funcs.forEach((v, k) => {
      this.functions.set(k, v.map(v => { return { func: v, isPrivate: false, inputs: v.inputSignature }; }));
    });
  }

  build(): sapp.Def {
    if (!this.generated) {
      const funcs = new Map();
      const instanceFuncs = new Map();
      this.generated = { ...this.header, funcs, instanceFuncs, instanceOverloads: this.def.structs.length };
      this.def.extensions.forEach(this.extendDef);
      this.def.structs.forEach(this.generateStruct);
      this.def.functions.forEach(this.generateFunction);
      this.functions.forEach(
        (f, n) => funcs.set(n, f.filter(f => !f.isPrivate).map(f => f.func))
      );
      this.instanceFunctions.forEach(
        (f, n) => instanceFuncs.set(n, f.filter(f => !f.isPrivate).map(f => f.functions))
      );
    }
    return this.generated;
  }
}