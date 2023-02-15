import { parser, sapp, ResolutionEnv, FunctionResolutionEnv, ParserError, FetchedInstanceFunc } from './common.ts';
import { ExpressionGenerator } from './expression_generator.ts';

export class Parameters {
  constructor(private readonly params: [string | null, sapp.Type][]) { }

  get(name: string): [number, sapp.Type] | undefined {
    const i = this.params.findIndex(n => n[0] === name);
    if (i !== undefined) return [i, this.params[i][1]];
  }
}

export class Locals {
  private locals: [string | null, sapp.Type][] = [];
  private readonly localStack: Locals['locals'][] = [];
  
  constructor() { }

  open() {
    this.localStack.push(this.locals);
    this.locals = this.locals.map(x => [...x]);
  }

  close() {
    const top = this.localStack.pop();
    if (!top) throw new Error('Trying to use undefined as locals');
    for (let i = top.length; i < this.locals.length; i++)
      top.push([null, this.locals[i][1]]);
    this.locals = top;
  }

  compatibleLocalType = (a: sapp.Type, b: sapp.Type) =>
    a.isEquals(b); // Can be optimized knowing which type is a pointer

  insert(name: string, tp: sapp.Type): number {
    for (let i = this.locals.length - 1; i >= 0; i--)
      if (this.locals[i][0] === null && this.compatibleLocalType(this.locals[i][1], tp)) {
        this.locals[i][0] = name;
        return i;
      }
    return this.locals.push([name, tp]) - 1;
  }

  collect = (): sapp.Type[] => this.locals.map(x => x[1]);

  get(name: string): [number, sapp.Type] | undefined {
    const i = this.locals.findIndex(n => n[0] === name);
    if (i !== undefined) return [i, this.locals[i][1]];
  }
}

class Function implements sapp.Func {
  private _source: sapp.Expression | undefined = undefined;
  private _locals: sapp.Type[] | undefined = undefined;

  constructor(
    public readonly inputSignature: sapp.Type[],
    public readonly fullInputSignature: sapp.Type[],
    private readonly meta: parser.ParserMeta,
    private output?: sapp.Type
  ) { }

  complete(source: sapp.Expression, locals: sapp.Type[], output: sapp.Type) {
    this._source = source;
    this._locals = locals;
    if (this.output !== undefined && this.output.isEquals(output))
        throw new ParserError(this.meta.line, 'Return type does not match expected return');
    this.output = output;
  }

  get source(): sapp.Expression {
    if (this._source === undefined) throw new ParserError(this.meta.line, 'Unknown source');
    return this._source;
  }

  get locals(): sapp.Type[] {
    if (this._locals === undefined) throw new ParserError(this.meta.line, 'Unknown locals');
    return this._locals;
  }

  get outputSignature(): sapp.Type {
    if (this.output === undefined) throw new ParserError(this.meta.line, 'Function output could not be determined');
    return this.output;
  }
}

export class FunctionGenerator implements FunctionResolutionEnv {
  public readonly inputs: sapp.Type[];
  public readonly fullInputs: sapp.Type[];
  private readonly _expr: ExpressionGenerator;
  private readonly _func: Function;
  private readonly _prms: Parameters;
  private readonly _lcls: Locals = new Locals();
  private _processed: boolean;

  constructor(
    func: parser.Func,
    private readonly env: ResolutionEnv,
    output?: sapp.Type,
    struct?: sapp.Type[]
  ) {
    const args = func.inputs.map(x => [x.name, env.resolveType(x.type)] as [string, sapp.Type]);
    this.inputs = args.map(x => x[1]);
    this.fullInputs = struct ? [...struct, ...this.inputs] : this.inputs;
    this._prms = new Parameters(args);
    this._expr = new ExpressionGenerator(this, func.source);
    this._func = new Function(this.inputs, this.fullInputs, func.meta, output);
    this._processed = false;
  }
  
  scoped<T>(action: () => T): T {
    this._lcls.open();
    const result = action();
    this._lcls.close();
    return result;
  }

  getValue(name: parser.ParserRoute): [sapp.Expression & { name: number; }, sapp.Type] {
    const param = this._prms.get(name.route[0]);
    if (param) {
      if (name.route[1] !== undefined) throw new ParserError(name.meta.line, `Cannot get property ${name.route[1]}`);
      return [{ id: 'param_get', name: param[0] }, param[1]];
    }
    const local = this._lcls.get(name.route[0]);
    if (local) {
      if (name.route[1] !== undefined) throw new ParserError(name.meta.line, `Cannot get property ${name.route[1]}`);
      return [{ id: 'local_get', name: local[0] }, local[1]];
    }
    throw new ParserError(name.meta.line, `Symbol not found: ${name.route[0]}`);
  }
  
  resolveType(raw: parser.Type): sapp.Type {
    return this.env.resolveType(raw);
  }

  fetchFunc(route: parser.ParserRoute, inputSignature: sapp.Type[]): sapp.Func | FetchedInstanceFunc {
    return this.env.fetchFunc(route, inputSignature);
  }

  generate() {
    if (!this._processed) {
      const [source, output] = this._expr.process();
      this._func.complete(source, this._lcls.collect(), output);
      this._processed = true;
    }
  }

  get func(): sapp.Func {
    this.generate();
    return this._func;
  }
}