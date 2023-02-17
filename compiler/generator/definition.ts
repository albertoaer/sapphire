import { sapp, parser, ResolutionEnv, FetchedInstanceFunc } from './common.ts';
import { FunctionGenerator } from './function.ts';
import { FeatureError, ParserError } from '../errors.ts';

export class Definition implements sapp.Def {
  constructor(
    public readonly name: string,
    public readonly route: sapp.ModuleRoute,
    public readonly instanceOverloads: number,
    // Functions under a name always have different input signature
    private readonly functions: { [name in string]: sapp.Func[] },
    
    // Functions under a name and index always have different full input signature but same input signature
    private readonly instanceFunctions: { [name in string]: sapp.Func[][] }
  ) {}

  get funcs(): sapp.Func[] { return Object.values(this.functions).flat() }

  get instanceFuncs(): sapp.Func[][] { return Object.values(this.instanceFunctions).flat(); }

  getFunc(name: string, inputSignature: sapp.Type[]): sapp.Func | undefined {
    return this.functions[name]
      ?.filter(x => x.inputSignature.length === inputSignature.length)
      .find(x => x.inputSignature.every((t, i) => t.isEquals(inputSignature[i])));
  }

  getInstanceFunc(name: string, inputSignature: sapp.Type[]): sapp.Func[] | undefined {
    return this.instanceFunctions[name]
    ?.filter(x => x[0].inputSignature.length === inputSignature.length)
    .find(x => x[0].inputSignature.every((t, i) => t.isEquals(inputSignature[i])));
  }
}

class InstanceFunction {
  // Each index is a struct
  private readonly functionsByStruct: (FunctionGenerator | undefined)[];
  private refLine: number;
  private firstIdx: number;

  constructor(first: { pre: parser.Func, func: FunctionGenerator, structIdx: number }, total: number) {
    this.functionsByStruct = new Array(total);
    this.refLine = first.pre.meta.line;
    this.push(first.pre, first.func, first.structIdx);
    this.firstIdx = first.structIdx;
  }

  signature(): sapp.Type[] {
    return (this.functionsByStruct[this.firstIdx] as FunctionGenerator).inputs;
  }

  push(pre: parser.Func, func: FunctionGenerator, structIdx: number) {
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

export class DefinitionGenerator implements ResolutionEnv {
  private readonly structs: sapp.Type[][] = [];
  
  // Functions under a name always have different input signature
  private readonly functions: { [name in string]: FunctionGenerator[] } = {};

  private readonly instanceFunctions: { [name in string]: InstanceFunction[] } = {};

  private generated: sapp.Def | undefined = undefined;

  constructor(
    public readonly route: sapp.ModuleRoute, private readonly env: ResolutionEnv, private readonly def: parser.Def
  ) { }

  resolveType(raw: parser.Type): sapp.Type {
    return this.env.resolveType(raw);
  }

  fetchFunc(route: parser.ParserRoute, inputSignature: sapp.Type[]): sapp.Func | FetchedInstanceFunc {
    const name = route.route[0] ?? ''; // Empty name method if no name provided
    const funcArr = this.functions[name];
    if (funcArr !== undefined) {
      const func = funcArr.find(x => x.inputs.every((x, i) => x.isEquals(inputSignature[i])));
      if (func === undefined)
        throw new ParserError(route.meta.line, `Invalid signature for function ${this.def.name}.${name}(...)`)
      if (route.route[1]) throw new FeatureError(route.meta.line, 'Function Attributes');
      return func.func;
    }
    return this.env.fetchFunc(route, inputSignature);
  }

  private generateStruct(pre: parser.Struct) {
    const struct: sapp.Type[] = pre.types.map(x => this.env.resolveType(x));
    if (this.structs.find(x => x.every((t, i) => t.isEquals(struct[i]))))
      throw new ParserError(pre.meta.line, 'Repeated struct');
    this.structs.push(struct);
  }

  private resolveStructIndex(heuristic: parser.HeuristicList, line: number): number {
    const types = heuristic.map(x => x.type ? this.env.resolveType(x.type) : null);
    const factible = this.structs.map((x, i) => [x, i]  as [sapp.Type[], number]).filter(
      ([x, _]) => x.length === heuristic.length
        && x.every((t, i) => types[i] === null || t.isEquals(types[i] as sapp.Type))
    );
    if (factible.length === 0) throw new ParserError(line, 'Struct mismatch');
    if (factible.length > 1) throw new ParserError(line, 'Struct ambiguity');
    return factible[0][1];
  }
  
  private includeFunction(pre: parser.Func, func: FunctionGenerator) {
    if (this.functions[pre.name] === undefined) this.functions[pre.name] = [];
    if (this.functions[pre.name].find(x => x.inputs.every((t, i) => t.isEquals(func.inputs[i]))))
      throw new ParserError(pre.meta.line, 'Repeated function signature');
    this.functions[pre.name].push(func);
  }

  private includeInstanceFunction(pre: parser.Func, func: FunctionGenerator, structIdx: number) {
    if (this.instanceFunctions[pre.name] === undefined) this.instanceFunctions[pre.name] = [];
    const idx = this.instanceFunctions[pre.name].findIndex(
      x => x.signature().length === func.inputs.length && x.signature().every((t, i) => t.isEquals(func.inputs[i]))
    );
    if (idx >= 0) this.instanceFunctions[pre.name][idx].push(pre, func, structIdx);
    else this.instanceFunctions[pre.name].push(new InstanceFunction({ pre, func, structIdx }, this.structs.length));
  }
  
  private generateFunction(pre: parser.Func) {
    const structIdx = pre.struct !== undefined ? this.resolveStructIndex(pre.struct, pre.meta.line) : undefined;
    const output = pre.output ? this.env.resolveType(pre.output) : undefined;
    const func = new FunctionGenerator(
      pre, this, output, structIdx !== undefined ? this.structs[structIdx] : undefined
    );
    if (structIdx === undefined) this.includeFunction(pre, func)
    else this.includeInstanceFunction(pre, func, structIdx);
  }

  private createDef(): sapp.Def {
    const functions = Object.fromEntries(Object.entries(this.functions).map(
      ([n, f]) => [n, f.map(f => f.func)]
    ));
    const instanceFunctions = Object.fromEntries(Object.entries(this.instanceFunctions).map(
      ([n, f]) => [n, f.map(f => f.functions)]
    ));
    return new Definition(this.def.name, this.route, this.structs.length, functions, instanceFunctions);
  }

  generate(): sapp.Def {
    if (this.generated === undefined) {
      this.def.structs.forEach(this.generateStruct.bind(this));
      this.def.functions.forEach(this.generateFunction.bind(this));
      this.generated = this.createDef();
    }
    return this.generated;
  }
}