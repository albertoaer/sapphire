import { sapp, parser, ResolutionEnv } from './common.ts';

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

export class ExpressionGenerator {
  private processed: [sapp.Expression, sapp.Type] | null = null;

  constructor(
    private readonly env: ResolutionEnv,
    private readonly args: Args,
    public readonly locals: Locals,
    private readonly expression: parser.Expression
  ) {}

  private processCall(ex: parser.Expression & { id: 'call' }): [sapp.Expression, sapp.Type] {
    throw new Error('todo')
  }
  
  private processGet(ex: parser.Expression & { id: 'get' }): [sapp.Expression, sapp.Type] {
    throw new Error('todo')
  }
  
  private processGroup(ex: parser.Expression & { id: 'group' }): [sapp.Expression, sapp.Type] {
    throw new Error('todo')
  }

  private processIf(ex: parser.Expression & { id: 'if' }): [sapp.Expression, sapp.Type] {
    throw new Error('todo')
  }
  
  private processIndex(ex: parser.Expression & { id: 'index' }): [sapp.Expression, sapp.Type] {
    throw new Error('todo')
  }
  
  private processLiteral({ id, value }: parser.Expression & { id: 'literal' }): [sapp.Expression, sapp.Type] {
    throw new Error('todo')
  }

  private processValue(ex: parser.Expression & { id: 'value' }): [sapp.Expression, sapp.Type] {
    throw new Error('todo')
  }

  private processBuild({ id, args }: parser.Expression & { id: 'build' }): [sapp.Expression, sapp.Type] {
    throw new Error('todo')
  }

  private processNone(_: parser.Expression & { id: 'none' }): [sapp.Expression, sapp.Type] {
    return [{ id: 'none' }, new sapp.Type('void')]
  }

  private processEx(ex: parser.Expression): [sapp.Expression, sapp.Type] {
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
  }

  process(): [sapp.Expression, sapp.Type] {
    if (this.processed === null) this.processed = this.processEx(this.expression);
    return this.processed;
  }
}