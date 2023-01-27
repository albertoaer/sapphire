export class ParserError extends Error {
  constructor(line: number, msg: string) {
    super(`Parser error, Line ${line}: ${msg}`);
  }
}