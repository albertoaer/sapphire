import { Type } from "./sapp.ts";

abstract class GenericError extends Error {
  constructor(head: string, line: number | null, msg: string) {
    super(head + (line !== null ? ` at line ${line}: ` : ': ') + msg);
  }
}

export class ParserError extends GenericError {
  constructor(line: number, msg: string) {
    super('Parser Error', line, msg);
  }
}

export type RegisteredUnsupportedFeature =
  'Attribute Access' | 'Struct Building' | 'Indexation' | 'Call Returned Function' | 'Function Attributes' |
  'Function Tables' | 'Native Functions' | 'Strings' | 'Ensured Definitions'

export class FeatureError extends GenericError {
  constructor(line: number | null, feature: RegisteredUnsupportedFeature) {
    super('Feature Error', line, `"${feature}" is not supported yet`);
  }
}

export class MatchTypeError extends GenericError {
  constructor(line: number, a: Type, b: Type) {
    super('Type Error', line, `${a.toString()} expected to be ${b.toString()}`);
  }
}

export class DependencyError extends GenericError {
  constructor(msg: string) {
    super('Dependency Error', null, msg);
  }
}

export class CompilerError extends GenericError {
  constructor(compiler: 'Wasm', msg: string) {
    super(`${compiler} Compiler Error`, null, msg);
  }
}

export class IOError extends GenericError {
  constructor(msg: string) {
    super('IO Error', null, msg);
  }
}