import { sapp, parser, FunctionResolutionEnv, basicInferLiteral } from './common.ts';
import { ParserError, FeatureError, MatchTypeError } from "../errors.ts";

export class ExpressionGenerator {
  private processed: [sapp.Expression, sapp.Type] | null = null;

  constructor(
    private readonly env: FunctionResolutionEnv,
    private readonly expression: parser.Expression
  ) {}

  private processCall(ex: parser.Expression & { id: 'call' }): [sapp.Expression, sapp.Type] {
    if (!('route' in ex.func)) throw new FeatureError(ex.meta.line, 'Call expression result');
    const callArgs = ex.args.map(x => this.processEx(x));
    const args = callArgs.map(x => x[0]);
    const func = this.env.fetchFunc(ex.func, callArgs.map(x => x[1]));
    return 'owner' in func
      ? [{ id: 'call_instanced', args, func: func.funcGroup, owner: func.owner }, func.funcGroup[0].outputSignature]
      : [{ id: 'call', args, func }, func.outputSignature];
  }
  
  private processGroup({ exprs, meta }: parser.Expression & { id: 'group' }): [sapp.Expression, sapp.Type] {
    if (exprs.length === 0) throw new ParserError(meta.line, 'Empty group');
    const group = this.env.scoped(() => exprs.map(x => this.processEx(x)));
    return [{ id: 'group', exprs: group.map(x => x[0]) }, group.at(-1)?.[1] as sapp.Type];
  }

  private processIf(ex: parser.Expression & { id: 'if' }): [sapp.Expression, sapp.Type] {
    const [cond_, boolExp] = this.processEx(ex.cond);
    if (boolExp.base !== 'bool') throw new MatchTypeError(ex.meta.line, boolExp, new sapp.Type('bool'));
    const [else_, branchA] = this.processEx(ex.else);
    const [then_, branchB] = this.processEx(ex.then);
    if (!branchA.isEquals(branchB)) throw new MatchTypeError(ex.meta.line, branchA, branchB);
    return [{ id: 'if', cond: cond_, else: else_, then: then_ }, branchA];
  }
  
  private processIndex(ex: parser.Expression & { id: 'index' }): [sapp.Expression, sapp.Type] {
    throw new FeatureError(ex.meta.line, 'Indexation');
  }
  
  private processLiteral({ value }: parser.Expression & { id: 'literal' }): [sapp.Expression, sapp.Type] {
    const literal: sapp.Literal = basicInferLiteral(value);
    return [{ id: 'literal', value: literal }, new sapp.Type(literal.type)];
  }

  private processValue({ name }: parser.Expression & { id: 'value' }): [sapp.Expression, sapp.Type] {
    return this.env.getValue(name);
  }

  private processBuild({ meta }: parser.Expression & { id: 'build' }): [sapp.Expression, sapp.Type] {
    throw new FeatureError(meta.line, 'Build structure');
  }

  private processNone(_: parser.Expression & { id: 'none' }): [sapp.Expression, sapp.Type] {
    return [{ id: 'none' }, new sapp.Type('void')]
  }

  private processEx(ex: parser.Expression): [sapp.Expression, sapp.Type] {
    switch (ex.id) {
      case 'call': return this.processCall(ex);
      case 'get': throw new FeatureError(ex.meta.line, 'Get property');
      case 'group': return this.processGroup(ex);
      case 'if': return this.processIf(ex);
      case 'index': return this.processIndex(ex);
      case 'literal': return this.processLiteral(ex);
      case 'value': return this.processValue(ex);
      case 'build': return this.processBuild(ex);
      case 'none': return this.processNone(ex);
    }
  }

  process(): [sapp.Expression, sapp.Type] {
    if (this.processed === null) this.processed = this.processEx(this.expression);
    return this.processed;
  }
}