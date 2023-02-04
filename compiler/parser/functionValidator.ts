import { ParserError } from './common.ts';
import * as tree from './tree.ts';

export type InProgressFunc = Omit<tree.SappFunc, 'return' | 'source'> & {
  source?: tree.SappExpression,
  return?: tree.SappType,
  validator?: FunctionValidator
}

export type ExpectReturn = { type: tree.SappType | null }

export function includeExpectReturn(exp: ExpectReturn, line: number, orig: tree.SappType | null) {
  if (orig) {
    if (exp.type && !tree.compareType(exp.type, orig))
      throw new ParserError(line, 'Unexpected type');
    else if (!exp.type)
      exp.type = orig;
  }
}

export type ArgList = {
  name: string | null,
  type: tree.SappType
}[]

export type DirtyExpression = ({
  readonly id: 'if', readonly cond: DirtyExpression, readonly then: DirtyExpression, readonly else: DirtyExpression
} | {
  readonly id: 'call', readonly func: DirtyExpression | string[], readonly args: DirtyExpression[]
} | {
  readonly id: 'literal', readonly value: tree.SappLiteral
} | {
  readonly id: 'value', readonly of: string[]
} | {
  readonly id: 'group', readonly exprs: DirtyExpression[]
} | {
  readonly id: 'index', readonly origin: DirtyExpression, readonly args: DirtyExpression[]
} | {
  readonly id: 'get', readonly origin: DirtyExpression, readonly name: string[]
} | {
  readonly id: 'build', readonly args: DirtyExpression[]
} | {
  readonly id: 'none', readonly line: number
}) & { readonly line: number }

export class FunctionValidator {
  private ctx: {
    father?: FunctionValidator['ctx'], // father context
    origin: number, // reserved index to avoid value replacing
    num: number, // offset of reserved since origin
    types: { [alias: string]: tree.SappType }
  } = { origin: 0, num: 0, types: { } };
  private final: [tree.SappExpression, tree.SappType] | null = null;
  
  constructor(
    private readonly globals: Map<string, tree.SappDef | tree.SappModule>,
    private readonly func: InProgressFunc,
    private readonly args: ArgList,
    private readonly structArgs: ArgList | undefined,
    private readonly expr: DirtyExpression,
    private expectReturn?: ExpectReturn
  ) { }

  set expectedReturn(val: ExpectReturn) {
    this.expectReturn = val;
  }

  private child() {
    this.ctx = { origin: this.ctx.origin + this.ctx.num, num: 0, types: { } };
  }

  private parent() {
    if (!this.ctx.father) throw new Error('Expecting parent context');
    this.ctx = this.ctx.father;
  }

  private kernel(name: string): tree.SappType {
    return { base: (this.globals.get('kernel') as tree.SappModule).defs[name] };
  }

  private wrapContext(fn: () => [tree.SappExpression, tree.SappType]): [tree.SappExpression, tree.SappType] {
    this.child();
    const ret = fn();
    this.parent();
    return ret;
  }

  private processCall(ex: DirtyExpression & { id: 'call' }): [tree.SappExpression, tree.SappType] {
    throw new Error('todo')
  }
  
  private processGet(ex: DirtyExpression & { id: 'get' }): [tree.SappExpression, tree.SappType] {
    throw new Error('todo')
  }
  
  private processGroup(ex: DirtyExpression & { id: 'group' }): [tree.SappExpression, tree.SappType] {
    const processed = ex.exprs.map(this.validateExpr.bind(this));
    return [{ id: 'group', exprs: processed.map(x => x[0]) }, processed.at(-1)?.[1] ?? this.kernel('void')]
  }

  private processIf(ex: DirtyExpression & { id: 'if' }): [tree.SappExpression, tree.SappType] {
    const [cond, boolean] = this.validateExpr(ex.cond);
    if (!tree.compareType(boolean, this.kernel('bool'))) throw new ParserError(ex.line, 'Condition must be a boolean');
    const [then, typeA] = this.validateExpr(ex.then);
    const [els, typeB] = this.validateExpr(ex.else);
    if (!tree.compareType(typeA, typeB)) throw new ParserError(ex.line, 'Both if branches must be same type');
    return [{ id: 'if', cond, then, else: els }, typeA];
  }
  
  private processIndex(ex: DirtyExpression & { id: 'index' }): [tree.SappExpression, tree.SappType] {
    throw new Error('todo')
  }
  
  private processLiteral({ id, value }: DirtyExpression & { id: 'literal' }): [tree.SappExpression, tree.SappType] {
    return [{ id, value }, tree.sappTypeOf(value)];
  }

  private processValue(ex: DirtyExpression & { id: 'value' }): [tree.SappExpression, tree.SappType] {
    throw new Error('todo')
  }

  private processBuild({ id, args, line }: DirtyExpression & { id: 'build' }): [tree.SappExpression, tree.SappType] {
    const processed = args.map(this.validateExpr.bind(this));
    const struct = this.func.memberOf.structs.find(x => tree.compareTypes(x.types, processed.map(x => x[1])));
    if (!struct) throw new ParserError(line, 'Invalid argument for this type');
    return [{ id, args: processed.map(x => x[0]), struct }, tree.sappTypeOf(this.func.memberOf)]
  }

  private processNone(_: DirtyExpression & { id: 'none' }): [tree.SappExpression, tree.SappType] {
    throw [{}, this.kernel('void')]
  }

  private validateExpr(ex: DirtyExpression): [tree.SappExpression, tree.SappType] {
    return this.wrapContext(() => {
      switch (ex.id) {
        case 'call': return this.processCall(ex);
        case 'get': return this.processGet(ex);
        case 'group': return this.processGroup(ex);
        case 'if': return this.processIf(ex);
        case 'index': return this.processIndex(ex);
        case 'literal': return this.processLiteral(ex);
        case 'value': return this.processValue(ex);
        case 'build': return this.processBuild(ex);
        case 'none': return this.processNone(ex);
      }
    });
  }

  validate(): boolean {
    if (this.final !== null) return false;
    this.final = this.validateExpr(this.expr);
    if (this.expectReturn)
      includeExpectReturn(this.expectReturn, this.expr.line, this.final[1]);
    return true;
  }
}