import {
  parser, sapp, DefinitionEnv, FunctionEnv, FunctionBuilder, NameRoute, FetchedFuncResult
} from './common.ts';
import { ExpressionGenerator } from './expression.ts';
import { FeatureError, ParserError } from '../errors.ts';

export class Parameters {
  constructor(private readonly params: [string | null, sapp.Type][]) { }

  get(name: string): [number, sapp.Type] | undefined {
    const i = this.params.findIndex(n => n[0] === name);
    if (i >= 0) return [i, this.params[i][1]];
  }

  getByIndex(idx: number): sapp.Type {
    return this.params[idx][1];
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
    public readonly dependsOn: Set<sapp.Func | sapp.Func[]>,
    private output?: sapp.Type,
    public readonly struct?: sapp.Type[],
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

export class FunctionGenerator implements FunctionEnv, FunctionBuilder {
  public readonly inputs: sapp.Type[];
  private readonly _expr: ExpressionGenerator;
  private readonly _func: Function;
  private readonly _prms: Parameters;
  private readonly _inst?: Parameters;
  private readonly _lcls: Locals = new Locals();
  private readonly _deps: Set<sapp.Func | sapp.Func[]> = new Set();
  private _treated: boolean;

  constructor(
    func: parser.Func,
    readonly definition: DefinitionEnv,
    public readonly isPrivate: boolean,
    output?: sapp.Type,
    struct?: sapp.Type[]
  ) {
    if (!func.source) throw new ParserError(func.meta.line, 'Expecting function body');
    const args = func.inputs.map(x => [x.name, definition.module.resolveType(x.type)] as [string | null, sapp.Type]);
    if (struct) {
      args.unshift(['this', definition.self]);
      this._inst = new Parameters(struct.map((tp, i) => [func.struct![i].name, tp]));
    }
    this.inputs = args.map(x => x[1]);
    this._prms = new Parameters(args);
    this._expr = new ExpressionGenerator(this, func.source, this._deps);
    this._func = new Function(this.inputs, func.meta, this._deps, output, struct);
    this._treated = false;
  }
  
  scoped<T>(action: () => T): T {
    this._lcls.open();
    const result = action();
    this._lcls.close();
    return result;
  }

  instance(): sapp.Expression | undefined {
    if (this._inst) {
      const instance = this._prms.getByIndex(0);
      return { id: 'local_get', name: 0, type: instance };
    }
  }

  private tryGet(name: string): sapp.Expression | undefined {
    const local = this._lcls.get(name);
    if (local) return { id: 'local_get', name: local[0], type: local[1] };
    const param = this._prms.get(name);
    if (param) return { id: 'param_get', name: param[0], type: param[1] };
    const instance = this.instance();
    if (instance) {
      const instp = this._inst!.get(name);
      if (instp) return { id: 'struct_access', struct: instance, idx: instp[0], type: instp[1] };
    }
  }

  fetchFunc(name: NameRoute, inputSignature: sapp.Type[]): FetchedFuncResult {
    const val = this.tryGet(name.next);
    if (val) {
      if(val.type.array) throw name.meta.error('Array has no function');
      if (typeof val.type.base === 'object' && 'route' in val.type.base) {
        throw new FeatureError(name.meta.line,'Function Tables'); 
      }
    }
    return;
  }

  getValue(name: NameRoute): sapp.Expression {
    const id = name.next;
    const v = this.tryGet(id);
    if (v) {
      if (name.isNext) throw name.meta.error(`Cannot get property: ${name.next}`);
      return v;
    }
    throw name.meta.error(`Symbol not found: ${id}`);
  }

  setValue(name: NameRoute, tp: sapp.Type): number {
    const id = name.next;
    if (this.tryGet(id))
      throw name.meta.error(`Already assigned a value to: ${id}`);
    if (name.isNext) throw name.meta.error(`Cannot get property: ${name.next}`);
    return this._lcls.insert(id, tp);
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