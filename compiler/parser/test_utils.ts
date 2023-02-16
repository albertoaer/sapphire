import { Parser } from "./parser.ts";

export const createParserFor = (source: string): Parser => new Parser({ source });

export function fastParse(code: string): Parser {
  const parser = createParserFor(code);
  parser.parse();
  return parser;
}