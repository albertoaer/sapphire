import { Type } from "./sapp.ts";

export class ParserError extends Error {
  constructor(line: number, msg: string) {
    super(`Parser error, Line ${line}: ${msg}`);
  }
}

export type RegisteredUnsupportedFeature =
  'Attribute Access' | 'Struct Building' | 'Indexation' | 'Call Returned Function' | 'Function Attributes' |
  'Function Tables' | 'Native Functions'

export class FeatureError extends Error {
  constructor(line: number, feature: RegisteredUnsupportedFeature) {
    super(`Error at line ${line}, feature "${feature}" is not supported yet`);
  }
}

export class MatchTypeError extends Error {
  constructor(line: number, a: Type, b: Type) {
    super(`TypeError at line ${line}, ${a.toString()} expected to be ${b.toString()}`);
  }
}

export class DependencyError extends Error {
  constructor(msg: string) {
    super(msg);
  }
}

export class CompilerError extends Error {
  constructor(compiler: 'Wasm', msg: string) {
    super(`${compiler} compiler error: ${msg}`);
  }
}

export class IOError extends Error {
  constructor(msg: string) {
    super(`IO error: ${msg}`);
  }
}