import { sapp, parser, FunctionEnv, NameRoute, FetchedInstanceFunc, FuncMismatch } from './common.ts';
import { MatchTypeError } from "../errors.ts";
import { InstancedDefInspector } from './inspector.ts';

export class ExpressionGenerator {
  private processed: sapp.Expression | null = null;

  constructor(
    private readonly env: FunctionEnv,
    private readonly expression: parser.Expression,
    private readonly dependencyPool: Set<sapp.Func | sapp.Func[]>
  ) {}

  private processAssign(ex: parser.Expression & { id: 'assign' }): sapp.Expression {
    const val = this.processEx(ex.value);
    const name = this.env.setValue(new NameRoute(ex.name), val.type);
    return { id: 'local_set', name, value: val, type: sapp.Void };
  }

  private notFoundFunction(meta: parser.ParserMeta, route: NameRoute): never {
    throw meta.error('Function not found: ' + route.toString());
  }

  private mismatchFunction(meta: parser.ParserMeta, inputs: sapp.Type[], mismatch: FuncMismatch): never {
    throw meta.error(
      `Signature error, ${mismatch.route.join('.')}(...) not defined for (${inputs.map(x => x.toString()).join(',')})`
    );
  }

  private fetchFunction(
    route: NameRoute, inputs: sapp.Type[]
  ): sapp.Func | FetchedInstanceFunc {
    const targets = [this.env, this.env.definition, this.env.definition.module];
    for (const target of targets) {
      const searchRoute = route.clone();
      const fn = target.fetchFunc(searchRoute, inputs);
      if (!fn) continue;
      if ('route' in fn) this.mismatchFunction(route.meta, inputs, fn);
      return fn;
    }
    throw this.notFoundFunction(route.meta, route);
  }

  private fetchInstanceFunction(
    route: NameRoute, inputs: sapp.Type[], instance: sapp.Expression
  ): sapp.Func | FetchedInstanceFunc {
    const fn = InstancedDefInspector.create(instance.type, instance, route.meta).fetchFunc(route, inputs);
    if (!fn) throw this.notFoundFunction(route.meta, route);
    if ('route' in fn) this.mismatchFunction(route.meta, inputs, fn);
    return fn;
  }

  private processCall(ex: parser.Expression & { id: 'call' }): sapp.Expression {
    const args = ex.args.map(x => this.processEx(x));
    const route = new NameRoute(ex.name ?? { route: [], meta: ex.meta });
    const inputs = args.map(x => x.type);
    const func = ex.instance
      ? this.fetchInstanceFunction(route, inputs, this.processEx(ex.instance))
      : this.fetchFunction(route, inputs);
    this.dependencyPool.add('owner' in func ? func.funcs : func);
    return 'owner' in func
      ? { id: 'call_instanced', args, func: func.funcs, owner: func.owner, type: func.funcs[0].outputSignature } 
      : { id: 'call', args, func, type: func.outputSignature };
  }

  private processTailCall(ex: parser.Expression & { id: 'tail_call' }): sapp.Expression {
    const args = ex.args.map(x => this.processEx(x));
    if (!sapp.typeArrayEquals(args.map(x => x.type), this.env.getArgumentsType()))
      throw ex.meta.error('Arguments type does not match function arguments');
    this.env.enableRecursivity();
    return { id: 'tail_call', args, type: this.env.getReturnType() };
  }
  
  private processGroup({ exprs, meta }: parser.Expression & { id: 'group' }): sapp.Expression {
    if (exprs.length === 0) throw meta.error('Empty group');
    const group = this.env.scoped(() => exprs.map(x => this.processEx(x)));
    return { id: 'group', exprs: group.map(x => x), type: group.at(-1)?.type! };
  }

  private processAccessIndex(ex: parser.Expression & { id: 'access_index' }): sapp.Expression {
    const structure = this.processEx(ex.structure);
    const idx = typeof ex.idx === 'number' ? ex.idx : this.processEx(ex.idx);
    let tp: sapp.Type;
    if (structure.type.array !== undefined) tp = new sapp.Type(structure.type.base);
    else if (Array.isArray(structure.type.base)) {
      if (typeof ex.idx !== 'number') throw ex.meta.error(`Expecting constant index for struct access`);
      if (ex.idx < 0 || ex.idx >= structure.type.base.length) throw ex.meta.error(`Index out of bounds`);
      tp = structure.type.base[ex.idx];
    } else throw ex.meta.error(`Type cannot be indexed: ${structure.type}`);
    return { id: 'access_index', structure, idx, type: tp };
  }

  private processIf(ex: parser.Expression & { id: 'if' }): sapp.Expression {
    const branches = {
      cond: this.processEx(ex.cond),
      then: this.processEx(ex.then),
      else: ex.else ? this.processEx(ex.else) : undefined
    };
    if (!branches.cond.type.isEquals(sapp.Bool))
      throw new MatchTypeError(ex.meta.line, branches.cond.type, sapp.Bool);
    if (branches.else) {
      if (!branches.then.type.isEquals(branches.else.type))
        throw new MatchTypeError(ex.meta.line, branches.then.type, branches.else.type);
    } else if (!branches.then.type.isEquals(sapp.Void))
      throw new MatchTypeError(ex.meta.line, branches.then.type, sapp.Void);
    return { id: 'if', ...branches, type: branches.then.type };
  }

  private processTuple({ exprs, meta }: parser.Expression & { id: 'tuple_literal' }): sapp.Expression {
    const items = exprs.map(x => this.processEx(x));
    if (items.length === 0) throw meta.error('Tuple with 0 elements is invalid');
    return { id: 'tuple_literal', exprs: items, type: new sapp.Type(items.map(x => x.type)) };
  }
  
  private processList({ exprs, meta }: parser.Expression & { id: 'list_literal' }): sapp.Expression {
    const items = exprs.map(x => this.processEx(x));
    if (!items.every((x, i) => i === 0 || x.type.isEquals(items[i-1].type)))
      throw meta.error('Every element in a list must have the same type');
    if (items.length === 0) throw meta.error('Empty list\' type can not be inferred');
    return { id: 'list_literal', exprs: items, type: new sapp.Type(items[0].type, 'auto') };
  }
  
  private processLiteral({ value }: parser.Expression & { id: 'literal' }): sapp.Expression {
    return { id: 'literal', value, type: new sapp.Type(value.type) };
  }

  private processValue({ name }: parser.Expression & { id: 'value' }): sapp.Expression {
    return this.env.getValue(new NameRoute(name));
  }

  private processBuild({ args, meta }: parser.Expression & { id: 'build' }): sapp.Expression {
    const params = args.map(x => this.processEx(x));
    const structIdx = this.env.definition.structFor(params.map(x => x.type));
    if (structIdx === undefined)
      throw meta.error('Cannot find a struct to build a instance');
    return { id: 'build', args: params, structIdx, type: this.env.definition.self };
  }

  private processNone(_: parser.Expression & { id: 'none' }): sapp.Expression {
    return { id: 'none', type: sapp.Void };
  }

  private processEx(ex: parser.Expression): sapp.Expression {
    switch (ex.id) {
      case 'assign': return this.processAssign(ex);
      case 'call': return this.processCall(ex);
      case 'tail_call': return this.processTailCall(ex);
      case 'group': return this.processGroup(ex);
      case 'access_index': return this.processAccessIndex(ex);
      case 'if': return this.processIf(ex);
      case 'tuple_literal': return this.processTuple(ex);
      case 'list_literal': return this.processList(ex);
      case 'literal': return this.processLiteral(ex);
      case 'value': return this.processValue(ex);
      case 'build': return this.processBuild(ex);
      case 'none': return this.processNone(ex);
    }
  }

  process(): sapp.Expression {
    if (this.processed === null) this.processed = this.processEx(this.expression);
    return this.processed;
  }
}