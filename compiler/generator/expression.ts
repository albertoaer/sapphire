import { sapp, parser, FunctionEnv, NameRoute, FetchedInstanceFunc } from './common.ts';
import { MatchTypeError } from "../errors.ts";
import { ParserMeta } from '../parser/common.ts';

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

  private fetchFunction(route: NameRoute, types: sapp.Type[], meta: ParserMeta): sapp.Func | FetchedInstanceFunc {
    const targets = [this.env, this.env.definition, this.env.definition.module];
    for (const target of targets) {
      const searchRoute = route.clone();
      const fn = target.fetchFunc(searchRoute, types);
      if (!fn) continue;
      if (fn === 'mismatch') throw meta.error(
        `Signature error, ${route.consume().join('.')}(...) not defined for (${types.map(x => x.toString()).join(',')})`
      );
      return fn;
    }
    throw meta.error('Function not found: ' + route.toString());
  }

  private processCall(ex: parser.Expression & { id: 'call' }): sapp.Expression {
    const args = ex.args.map(x => this.processEx(x));
    const func = this.fetchFunction(
      new NameRoute(ex.name ?? { route: [], meta: ex.meta }), args.map(x => x.type), ex.meta
    );
    this.dependencyPool.add('owner' in func ? func.funcs : func);
    return 'owner' in func
      ? { id: 'call_instanced', args, func: func.funcs, owner: func.owner, type: func.funcs[0].outputSignature } 
      : { id: 'call', args, func, type: func.outputSignature };
  }
  
  private processGroup({ exprs, meta }: parser.Expression & { id: 'group' }): sapp.Expression {
    if (exprs.length === 0) throw meta.error('Empty group');
    const group = this.env.scoped(() => exprs.map(x => this.processEx(x)));
    return { id: 'group', exprs: group.map(x => x), type: group.at(-1)?.type! };
  }

  private processIf(ex: parser.Expression & { id: 'if' }): sapp.Expression {
    const cond_ = this.processEx(ex.cond);
    if (cond_.type.base !== 'bool') throw new MatchTypeError(ex.meta.line, cond_.type, new sapp.Type('bool'));
    const then_ = this.processEx(ex.then);
    const else_ = this.processEx(ex.else);
    if (!else_.type.isEquals(then_.type)) throw new MatchTypeError(ex.meta.line, else_.type, then_.type);
    return { id: 'if', cond: cond_, else: else_, then: then_, type: then_.type };
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
      case 'group': return this.processGroup(ex);
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