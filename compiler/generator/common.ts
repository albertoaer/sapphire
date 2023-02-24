import * as parser from '../parser/common.ts';
export * as parser from '../parser/common.ts';
import * as sapp from '../sapp.ts';
export * as sapp from '../sapp.ts';

export type FetchedInstanceFunc = {
  funcGroup: sapp.Func[],
  owner: sapp.Expression
}

export interface ResolutionEnv {
  resolveType(raw: parser.Type): sapp.Type;

  fetchFunc(route: parser.ParserRoute, inputSignature: sapp.Type[]): sapp.Func | FetchedInstanceFunc;
}

export interface DefinitionResolutionEnv extends ResolutionEnv {
  structFor(types: sapp.Type[]): number | undefined;
  readonly self: sapp.Type;
}

export interface FunctionResolutionEnv extends DefinitionResolutionEnv {
  getValue(name: parser.ParserRoute): sapp.Expression & { name: number };
  setValue(name: parser.ParserRoute, tp: sapp.Type): number;

  scoped<T>(action: () => T): T;
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