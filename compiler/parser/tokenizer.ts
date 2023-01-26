import { ParserError, Token } from './parser.ts';

const keywords = [
  'def', 'except', 'extend', 'open', 'use', 'it',
  'if','then', 'end', 'struct', 'priv', 'as',
  'into', 'this', 'ensured', 'implicit'
]

const isOpChar = (c: string) => c.length == 1 && '^*+-%&$/@!|'.includes(c)

const isDelimiter = (c: string) => c.length == 1 && '()[]{};'.includes(c)

const isIdChar = (c: string) => c.length == 1 && c.match(/[a-z_]/i) != null

const isNumChar = (c: string) => c.length == 1 && c.match(/[0-9]/) != null

const isSpacer = (c: string) => c.length == 1 && '\n\t '.includes(c)

const commentMark = '#'

type tkStep = 'start' | 'comment' | { type: '.' } | {
  type: 'id' | 'str' | 'op' | 'num' | 'num.' | 'delim',
  value: string
}

function stepToToken(step: tkStep): Omit<Token, 'line'>[] {
  if (step === 'start' || step === 'comment') return [];
  if (step.type === '.') return [{ type: 'delimiter', value: step.type }];
  if (step.type === 'id') return [{
    type: keywords.includes(step.value) ? 'keyword' : 'identifier', value: step.value
  }];
  return [{
    type: ({
      'op': 'operator',
      'str': 'string',
      'num': 'int',
      'num.': 'float',
      'delim': 'delimiter'
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
  if (isDelimiter(value)) return { value, type: 'delim' };
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
}