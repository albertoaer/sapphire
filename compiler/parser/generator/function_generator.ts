import { parser, sapp, ResolutionEnv, FunctionResolutionEnv, ParserError, FetchedInstanceFunc } from './common.ts';
import { ExpressionGenerator } from './expression_generator.ts';

export class Args {
  constructor(private readonly args: [string | null, sapp.Type][]) {}

  getType(name: string): sapp.Type | undefined {
    return this.args.find(n => n[0] === name)?.[1];
  }

  getIndex(name: string): number | undefined {
    const n = this.args.findIndex(n => n[0] === name);
    return n < 0 ? undefined : n;
  }
}

export class Locals {
  private constructor(private readonly types: [sapp.Type, boolean][]) {}

  compatibleLocalType = (a: sapp.Type, b: sapp.Type) =>
    a.isEquals(b); // Can be optimized knowing which type is a pointer

  insert(tp: sapp.Type): number {
    const n = this.types.findIndex(tpi => tpi[1] && this.compatibleLocalType(tpi[0], tp))
    if (n < 0) return this.types.push([tp, true]) - 1;
    return n;
  }

  collect = () => this.types.map(x => x[0]);

  static create(): Locals {
    return new Locals([]);
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
  private readonly _args: Args;
  private readonly _locals: Locals = Locals.create();
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
    this._args = new Args(args);
    this._expr = new ExpressionGenerator(this, func.source);
    this._func = new Function(this.inputs, this.fullInputs, func.meta, output);
    this._processed = false;
  }

  getValue(name: parser.ParserRoute): [sapp.Expression & { name: number; }, sapp.Type] {
    throw new Error('todo')
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
      this._func.complete(source, this._locals.collect(), output);
      this._processed = true;
    }
  }

  get func(): sapp.Func {
    this.generate();
    return this._func;
  }
}