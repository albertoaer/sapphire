import { ModuleParser } from "./module_parser.ts";
import { Tokenizer } from "./tokenizer.ts";

export const createParserFor = (code: string): ModuleParser => new ModuleParser(new Tokenizer().getTokenList(code));

export function fastParse(code: string): ModuleParser {
  const parser = createParserFor(code);
  parser.parse();
  return parser;
}