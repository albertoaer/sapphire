import { ParserError } from '../errors.ts';

export type Token = {
  line: number,
  type: 'keyword' | 'identifier' | 'operator' | 'int' | 'float' | 'string',
  value: string
}

export const Keywords = [
  'def', 'except', 'extend', 'open', 'use', 'it',
  'if','then', 'else', 'end', 'struct', 'priv', 'as',
  'into', 'this', 'ensured', 'implicit', 'true', 'false',
  '(', ')', '[', ']', '{', '}', ';', ',', '.', ':', '_'
] as const

export const OperatorList = '^*+-%&$/@!|=<>';

const isOpChar = (c: string) => c.length == 1 && OperatorList.includes(c)

const isIdChar = (c: string) => c.length == 1 && c.match(/[a-z_]/i) != null

const isNumChar = (c: string) => c.length == 1 && c.match(/[0-9]/) != null

const isSpacer = (c: string) => c.length == 1 && '\n\t\r '.includes(c)

const isKeyword = (c: string) => (Keywords as readonly string[]).includes(c);

const commentMark = '#'

type tkStep = 'start' | 'comment' | { type: '.' } | {
  type: 'id' | 'str' | 'op' | 'num' | 'num.' | 'delim',
  value: string
}

function stepToToken(step: tkStep): Omit<Token, 'line'>[] {
  if (step === 'start' || step === 'comment') return [];
  if (step.type === '.') return [{ type: 'keyword', value: step.type }];
  if (step.type === 'id') return [{
    type: isKeyword(step.value) ? 'keyword' : 'identifier', value: step.value
  }];
  return [{
    type: ({
      'op': 'operator',
      'str': 'string',
      'num': 'int',
      'num.': 'float',
      'delim': 'keyword'
    } as const)[step.type],
    value: step.value
  }];
}

function startOfTk(value: string): tkStep {
  if (isOpChar(value)) return { value, type: 'op' };
  if (isIdChar(value)) return { value, type: 'id' };
  if (isNumChar(value)) return { value, type: 'num' };
  if (value === '.') return { type: '.' };
  if (value === '"') return { value: '', type: 'str' };
  if (isSpacer(value)) return 'start';
  if (value === commentMark) return 'comment';
  if (isKeyword(value)) return { value, type: 'delim' };
  throw new Error(`Unexpected ${value}`);
}

function stringPush(value: string, c: string): [tkStep, Omit<Token, 'line'>[]] {
  if (c === '"') return ['start', [{ type: 'string', value: value }]];
  return [{ type: 'str', value: value + c }, []]
}

function transition(step: Extract<tkStep, { type: string }>, c: string): [tkStep, Omit<Token, 'line'>[]] {
  if (c === commentMark) return ['comment', stepToToken(step)];
  if (step.type === '.' && isNumChar(c)) return [{ value: step.type + c, type: 'num.' }, []];
  if (step.type === 'str') return stringPush(step.value, c);
  if (
    (step.type === 'id' && (isIdChar(c) || isNumChar(c))) ||
    (step.type === 'op' && isOpChar(c)) ||
    ((step.type === 'num' || step.type == 'num.') && isNumChar(c))
  ) {
    step.value += c;
    return [step, []]
  }
  if (step.type === 'num' && c === '.')
    return [{ type: 'num.', value: step.value + c }, []];
  return [startOfTk(c), stepToToken(step)];
}

// TODO: Provide a configuration object to the tokenizer
export class Tokenizer {
  getTokens(source: string): Token[] {
    let step: tkStep = 'start';
    let line = 1;
    const collected: Token[] = [];
    try {
      for (const c of source) {
        if (step !== 'comment') {
          const ret: ReturnType<typeof transition> = step === 'start' ? [startOfTk(c), []] : transition(step, c);
          step = ret[0];
          collected.push(...ret[1].map(x => { return { line, ...x} }));
        }
        if (c === '\n') {
          line++;
          if (step === 'comment') step = 'start';
        }
      }
      collected.push(...stepToToken(step).map(x => { return { line, ...x} }));
    } catch (e) {
      throw new ParserError(line, String(e));
    }
    return collected;
  }

  getTokenList(source: string): TokenList {
    return new TokenList(this.getTokens(source));
  }
}

export type TokenExpect = { type: Exclude<Token['type'], 'keyword'> } | { value: typeof Keywords[number] };

export class TokenList {
  private current = 0;

  constructor(public readonly tokens: Token[]) {}

  get empty(): boolean { return this.current >= this.tokens.length }

  get line(): number { return this.tokens[this.current]?.line ?? this.tokens[this.current-1]?.line ?? 1 }

  nextIs(expect: TokenExpect): Token | undefined {
    if (this.empty) return undefined;
    const token = this.tokens[this.current];
    if (
      ('value' in expect && token.type == 'keyword' && token.value == expect.value) ||
      ('type' in expect && token.type == expect.type)
    ) {
      this.current++;
      return token;
    }
    return undefined;
  }

  expectNext(expect: TokenExpect): Token {
    const token = this.nextIs(expect);
    if (!token) throw new ParserError(
      this.line,
      `Expecting ${'type' in expect ? expect.type : expect.value}`
    );
    return token;
  }

  unexpect() {
    if (!this.empty) throw new ParserError(
      this.tokens[this.current].line, `Unexpected ${this.tokens[this.current].value}`
    );
  }

  emitError(msg: string, line?: number): never {
    throw new ParserError(line ?? this.line, msg);
  }

  remain(): Token[] {
    return this.tokens.slice(this.current);
  }
}