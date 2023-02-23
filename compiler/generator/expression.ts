import { sapp, parser, FunctionResolutionEnv, basicInferLiteral } from './common.ts';
import { ParserError, FeatureError, MatchTypeError } from "../errors.ts";

export class ExpressionGenerator {
  private processed: sapp.Expression | null = null;

  constructor(
    private readonly env: FunctionResolutionEnv,
    private readonly expression: parser.Expression
  ) {}

  private processAssign(ex: parser.Expression & { id: 'assign' }): sapp.Expression {
    const val = this.processEx(ex.value);
    const name = this.env.setValue(ex.name, val.type);
    return { id: 'local_set', name, value: val, type: sapp.Void };
  }

  private processCall(ex: parser.Expression & { id: 'call' }): sapp.Expression {
    if (!('route' in ex.func)) throw new FeatureError(ex.meta.line, 'Call Returned Function');
    const args = ex.args.map(x => this.processEx(x));
    const func = this.env.fetchFunc(ex.func, args.map(x => x.type));
    return 'owner' in func
      ? { id: 'call_instanced', args, func: func.funcGroup, owner: func.owner, type: func.funcGroup[0].outputSignature } 
      : { id: 'call', args, func, type: func.outputSignature };
  }
  
  private processGroup({ exprs, meta }: parser.Expression & { id: 'group' }): sapp.Expression {
    if (exprs.length === 0) throw new ParserError(meta.line, 'Empty group');
    const group = this.env.scoped(() => exprs.map(x => this.processEx(x)));
    return { id: 'group', exprs: group.map(x => x), type: group.at(-1)?.type! };
  }

  private processIf(ex: parser.Expression & { id: 'if' }): sapp.Expression {
    const cond_ = this.processEx(ex.cond);
    if (cond_.type.base !== 'bool') throw new MatchTypeError(ex.meta.line, cond_.type, new sapp.Type('bool'));
    const then_ = this.processEx(ex.then);
    const else_ = this.processEx(ex.else);
    if (!else_.type.isEquals(then_.type)) throw new MatchTypeError(ex.meta.line, else_.type, else_.type);
    return { id: 'if', cond: cond_, else: else_, then: then_, type: then_.type };
  }

  private processTuple({ exprs, meta }: parser.Expression & { id: 'tuple_literal' }): sapp.Expression {
    const items = exprs.map(x => this.processEx(x));
    if (items.length === 0) throw new ParserError(meta.line, 'Tuple with 0 elements is invalid');
    return { id: 'tuple_literal', exprs: items, type: new sapp.Type(items.map(x => x.type)) };
  }
  
  private processList({ exprs, meta }: parser.Expression & { id: 'list_literal' }): sapp.Expression {
    const items = exprs.map(x => this.processEx(x));
    if (!items.every((x, i) => i === 0 || x.type.isEquals(items[i-1].type)))
      throw new ParserError(meta.line, 'Every element in a list must have the same type');
    if (items.length === 0) throw new ParserError(meta.line, 'Empty list\' type can not be inferred');
    return { id: 'list_literal', exprs: items, type: new sapp.Type(items[0].type, 'auto') };
  }
  
  private processIndex(ex: parser.Expression & { id: 'index' }): sapp.Expression {
    throw new FeatureError(ex.meta.line, 'Indexation');
  }
  
  private processLiteral({ value }: parser.Expression & { id: 'literal' }): sapp.Expression {
    const literal: sapp.Literal = basicInferLiteral(value);
    return { id: 'literal', value: literal, type: new sapp.Type(literal.type) };
  }

  private processValue({ name }: parser.Expression & { id: 'value' }): sapp.Expression {
    return this.env.getValue(name);
  }

  private processBuild({ meta }: parser.Expression & { id: 'build' }): sapp.Expression {
    throw new FeatureError(meta.line, 'Struct Building');
  }

  private processNone(_: parser.Expression & { id: 'none' }): sapp.Expression {
    return { id: 'none', type: sapp.Void };
  }

  private processEx(ex: parser.Expression): sapp.Expression {
    switch (ex.id) {
      case 'assign': return this.processAssign(ex);
      case 'call': return this.processCall(ex);
      case 'get': throw new FeatureError(ex.meta.line, 'Attribute Access');
      case 'group': return this.processGroup(ex);
      case 'if': return this.processIf(ex);
      case 'tuple_literal': return this.processTuple(ex);
      case 'list_literal': return this.processList(ex);
      case 'index': return this.processIndex(ex);
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