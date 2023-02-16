import { Parser } from "./parser.ts";

export const parserFor = (source: string): Parser => new Parser({ source });

export function fastParse(code: string): Parser {
  const parser = parserFor(code);
  parser.parse();
  return parser;
}