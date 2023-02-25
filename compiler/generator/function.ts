import { parser, sapp, DefinitionResolutionEnv, FunctionResolutionEnv, FetchedInstanceFunc } from './common.ts';
import { ExpressionGenerator } from './expression.ts';
import { ParserError } from '../errors.ts';

export class Parameters {
  constructor(private readonly params: [string | null, sapp.Type][]) { }

  get(name: string): [number, sapp.Type] | undefined {
    const i = this.params.findIndex(n => n[0] === name);
    if (i >= 0) return [i, this.params[i][1]];
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
    if (i >= 0) return [i, this.locals[i][1]];
  }
}

class Function implements sapp.Func {
  private _source: sapp.Expression | undefined = undefined;
  private _locals: sapp.Type[] | undefined = undefined;

  constructor(
    public readonly inputSignature: sapp.Type[],
    private readonly meta: parser.ParserMeta,
    private output?: sapp.Type,
    public readonly struct?: sapp.Type[]
  ) { }

  complete(source: sapp.Expression, locals: sapp.Type[]) {
    this._source = source;
    this._locals = locals;
    if (this.output !== undefined && !this.output.isEquals(source.type))
      throw new ParserError(
        this.meta.line, `Return type does not match expected return, ${this.output} != ${source.type}`
      );
    this.output = source.type;
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
  private readonly _expr: ExpressionGenerator;
  private readonly _func: Function;
  private readonly _prms: Parameters;
  private readonly _lcls: Locals = new Locals();
  private _treated: boolean;

  constructor(
    func: parser.Func,
    private readonly env: DefinitionResolutionEnv,
    output?: sapp.Type,
    struct?: sapp.Type[]
  ) {
    if (!func.source) throw new ParserError(func.meta.line, 'Expecting function body');
    const args = func.inputs.map(x => [x.name, env.resolveType(x.type)] as [string, sapp.Type]);
    this.inputs = args.map(x => x[1]);
    this._prms = new Parameters(args);
    this._expr = new ExpressionGenerator(this, func.source);
    this._func = new Function(this.inputs, func.meta, output, struct);
    this._treated = false;
  }

  get self(): sapp.Type {
    return this.env.self;
  }

  structFor(types: sapp.Type[]): number | undefined {
    return this.env.structFor(types);
  }
  
  scoped<T>(action: () => T): T {
    this._lcls.open();
    const result = action();
    this._lcls.close();
    return result;
  }

  private getNoThrow(name: string): sapp.Expression & { name: number; } | undefined {
    const local = this._lcls.get(name);
    if (local) return { id: 'local_get', name: local[0], type: local[1] };
    const param = this._prms.get(name);
    if (param) return { id: 'param_get', name: param[0], type: param[1] };
  }

  getValue(name: parser.ParserRoute): sapp.Expression & { name: number; } {
    if (name.route[0] === undefined) throw new ParserError(name.meta.line, 'Empty route');
    const v = this.getNoThrow(name.route[0]);
    if (v) {
      if (name.route[1] !== undefined) throw new ParserError(name.meta.line, `Cannot get property: ${name.route[1]}`);
      return v;
    }
    throw new ParserError(name.meta.line, `Symbol not found: ${name.route[0]}`);
  }

  setValue(name: parser.ParserRoute, tp: sapp.Type): number {
    if (this.getNoThrow(name.route[0]))
      throw new ParserError(name.meta.line, `Already assigned a value to: ${name.route[0]}`);
    if (name.route[1] !== undefined) throw new ParserError(name.meta.line, `Cannot get property: ${name.route[1]}`);
    return this._lcls.insert(name.route[0], tp);
  }
  
  resolveType(raw: parser.Type): sapp.Type {
    return this.env.resolveType(raw);
  }

  fetchFunc(route: parser.ParserRoute, inputSignature: sapp.Type[]): sapp.Func | FetchedInstanceFunc {
    return this.env.fetchFunc(route, inputSignature);
  }

  generate() {
    if (!this._treated) {
      this._treated = true;
      this._func.complete(this._expr.process(), this._lcls.collect());
    }
  }

  get func(): sapp.Func {
    this.generate();
    return this._func;
  }
}