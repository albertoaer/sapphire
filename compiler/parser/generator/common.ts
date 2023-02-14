import * as parser from '../module_parser.ts';
export * as parser from '../module_parser.ts';
import * as sapp from '../sapp.ts';
export * as sapp from '../sapp.ts';
export { ParserError, FeatureError } from '../common.ts';

export class MatchTypeError extends Error {
  constructor(line: number, a: sapp.Type, b: sapp.Type) {
    super(`TypeError at line ${line}, ${a.toString()} expected to be ${b.toString()}`);
  }
}

export type FetchedInstanceFunc = {
  funcGroup: sapp.Func[],
  owner: sapp.Expression
}

export interface ResolutionEnv {
  resolveType(raw: parser.Type): sapp.Type;

  fetchFunc(route: parser.ParserRoute, inputSignature: sapp.Type[]): sapp.Func | FetchedInstanceFunc;
}

export interface FunctionResolutionEnv extends ResolutionEnv {
  getValue(name: parser.ParserRoute): [sapp.Expression & { name: number }, sapp.Type];
}

/**
 * Utility function, It assumes int as i32 and float as f64
 * @param literal the parsed literal
 * @returns the generated valid literal
 */
export function basicInferLiteral({ value, type }: parser.Literal): sapp.Literal {
  return { value, type: ({
    'bool': 'bool',
    'string': 'string',
    'int': 'i32',
    'float': 'f64'
  } as const)[type] };
}