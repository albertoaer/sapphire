import type { TokenList } from './tokenizer.ts';
import * as tree from './tree.ts';
import { ModuleGenerator, DirtyArgList, DirtyStruct, DirtyFunc, DirtyType, DirtyExpression } from './moduleGenerator.ts';

export class ModuleParser {
  constructor(
    private readonly generator: ModuleGenerator,
    private readonly tokens: TokenList,
  ) {}

  private parseName(init: string): string[] {
    const route = [init];
    while (this.tokens.nextIs({ value: '.' })) {
      route.push(this.tokens.expectNext({ type: 'identifier' }).value);
    }
    return route;
  }

  private parseType(): DirtyType {
    const line = this.tokens.line;
    const base: DirtyType[] | string[] = [];
    const array = !!this.tokens.nextIs({ value: '[' });
    if (this.tokens.nextIs({ value: '(' })) {
      do {
        (base as DirtyType[]).push(this.parseType());
      } while (this.tokens.nextIs({ value: ',' }));
      this.tokens.expectNext({ value: ')' });
    } else {
      (base as string[]).push(...this.parseName(this.tokens.expectNext({ type: 'identifier' }).value));
    }
    if (array) this.tokens.expectNext({ value: ']' });
    return { array, base, line }
  }

  private tryParseLiteral(): tree.SappLiteral | undefined {
    const tk =
      this.tokens.nextIs({ type: 'string' }) ??
      this.tokens.nextIs({ type: 'float' }) ??
      this.tokens.nextIs({ type: 'int' });
    if (tk) {
      const kernel = this.generator.getMod('kernel');
      if (!kernel) this.tokens.emitError(`No kernel provided`);
      const type = kernel.defs[tk.type];
      if (!type) this.tokens.emitError(`Kernel does not provide ${tk.type}`);
      return { type, value: tk.value };
    }
  }

  private parseExpression(): DirtyExpression {
    const ex = this.tryParseLiteral();
    if (ex) return { id: 'literal', nodes: [ex] };
    this.tokens.emitError('Expecting expression');
  }

  private parseStruct(): DirtyStruct {
    const struct: DirtyStruct = { types: [] };
    do {
      struct.types.push(this.parseType());
    } while (this.tokens.nextIs({ value: ',' }));
    return struct;
  }

  private parseArgList(): DirtyArgList {
    const args: DirtyArgList = [];
    if (!this.tokens.nextIs({ value: ')' })) {
      do {
        const type = this.parseType();
        const name = this.tokens.expectNext({ type: 'identifier' }).value;
        args.push({ name: name === '_' ? null : name, type });
      } while (this.tokens.nextIs({ value: ',' }));
      this.tokens.expectNext({ value: ')' });
    }
    return args;
  }

  private parseFunc(name: string, struct?: DirtyArgList): DirtyFunc {
    this.tokens.expectNext({ value: '(' });
    const line = this.tokens.line;
    const args = this.parseArgList();
    const expectedReturn = this.tokens.nextIs({ value: ':' }) ? this.parseType() : undefined;
    const source: DirtyExpression[] = [];
    do {
      source.push(this.parseExpression());
    } while (this.tokens.nextIs({ value: ',' }));
    return { args, name, expectedReturn, struct, source, line }
  }

  private parseMethod(): DirtyFunc {
    const args = this.parseArgList();
    this.tokens.expectNext({ value: ':' });
    this.tokens.expectNext({ value: ':' });
    return this.parseFunc(this.tokens.expectNext({ type: 'identifier' }).value, args);
  }

  private parseUse() {
    const line = this.tokens.line;
    const route = this.parseName(this.tokens.expectNext({ type: 'identifier' }).value);
    const into = !!this.tokens.nextIs({ value: 'into'});
    this.generator.useMod(route, into, line)
  }

  private parseDef() {
    const name = this.tokens.expectNext({ type: 'identifier' }).value;
    const functions: DirtyFunc[] = [];
    const structs: DirtyStruct[] = [];
    do {
      let tk;
      if ((tk = this.tokens.nextIs({ type: 'identifier' }))) functions.push(this.parseFunc(tk.value));
      else if ((tk = this.tokens.nextIs({ value: 'struct' }))) structs.push(this.parseStruct());
      else if ((tk = this.tokens.nextIs({ value: '(' }))) functions.push(this.parseMethod());
    } while (this.tokens.nextIs({ value: ';' }));
    this.tokens.expectNext({ value: 'end' });
    this.generator.addDef(name, structs, functions);
  }

  parse() {
    while (!this.tokens.empty) {
      if (this.tokens.nextIs({ value: 'use' })) this.parseUse();
      else if (this.tokens.nextIs({ value: 'def' })) this.parseDef();
      else this.tokens.unexpect();
    }
  }
}

export interface IOParserSupport {
  solveModuleRoute(descriptor: tree.SappModuleDescriptor): tree.SappModuleRoute;
  getModuleTokens(route: tree.SappModuleRoute): TokenList;
}

export class Parser {
  moduleRelations: number[][] = [];
  moduleInfo: { [name in tree.SappModuleRoute]?: { idx: number, mod: tree.SappModule } } = {};

  constructor(private io: IOParserSupport) {}

  parseModule = (descriptor: tree.SappModuleDescriptor): tree.SappModule => {
    const route = this.io.solveModuleRoute(descriptor);
    if (route !in this.moduleInfo) {
      const generator = new ModuleGenerator(route, this.parseModule);
      new ModuleParser(generator, this.io.getModuleTokens(route)).parse();
      const mod = generator.getModule();
      this.moduleInfo[route] = { idx: this.moduleRelations.push([]), mod };
      return mod;
    }
    return this.moduleInfo[route]?.mod as tree.SappModule;
  }
}