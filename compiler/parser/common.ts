export class ParserError extends Error {
  constructor(line: number, msg: string) {
    super(`Parser error, Line ${line}: ${msg}`);
  }
}

export class FeatureError extends Error {
  constructor(line: number, feature: string) {
    super(`Error at line ${line}, feature "${feature}" is not supported yet`);
  }
}