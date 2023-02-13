import { parser, sapp, ResolutionEnv, ParserError } from './common.ts';
import { Args, Locals, ExpressionGenerator } from './expression_generator.ts';

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

export class FunctionGenerator {
  public readonly inputs: sapp.Type[];
  public readonly fullInputs: sapp.Type[];
  private readonly _expr: ExpressionGenerator;
  private readonly _func: Function;
  private _processed: boolean;

  constructor(
    func: parser.Func,
    env: ResolutionEnv,
    output?: sapp.Type,
    struct?: sapp.Type[]
  ) {
    const args = func.inputs.map(x => [x.name, env.resolveType(x.type)] as [string, sapp.Type]);
    this.inputs = args.map(x => x[1]);
    this.fullInputs = struct ? [...struct, ...this.inputs] : this.inputs;
    this._expr = new ExpressionGenerator(env, new Args(args), Locals.create(), func.source);
    this._func = new Function(this.inputs, this.fullInputs, func.meta, output);
    this._processed = false;
  }

  generate() {
    if (!this._processed) {
      const [source, output] = this._expr.process();
      const locals = this._expr.locals.collect();
      this._func.complete(source, locals, output);
      this._processed = true;
    }
  }

  get func(): sapp.Func {
    this.generate();
    return this._func;
  }
}