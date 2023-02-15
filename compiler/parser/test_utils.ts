import { ModuleParser } from "./module_parser.ts";
import { Tokenizer } from "./tokenizer.ts";
import * as sapp from "./sapp.ts"
import { ModuleGenerator } from "./generator/module_generator.ts";

export const createParserFor = (code: string): ModuleParser => new ModuleParser(new Tokenizer().getTokenList(code));

export function fastParse(code: string): ModuleParser {
  const parser = createParserFor(code);
  parser.parse();
  return parser;
}

export function getModule(code: string): sapp.Module {
  const gen = new ModuleGenerator(new Map(), 'virtual:main', fastParse(code).definitions);
  return gen.module;
}