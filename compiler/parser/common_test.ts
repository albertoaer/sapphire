import { ModuleGenerator } from "./moduleGenerator.ts";
import { ModuleParser } from "./parser.ts";
import { Tokenizer } from "./tokenizer.ts";
import * as tree from "./tree.ts";

export const modules: Record<string, tree.SappModule> = {
  kernel: {
    route: 'kernel',
    defs: {
      void: {
        name: 'void', origin: 'kernel', functions: {}, structs: []
      },
      int: {
        name: 'int', origin: 'kernel', functions: {}, structs: []
      },
      bool: {
        name: 'bool', origin: 'kernel', functions: {}, structs: []
      },
      float: {
        name: 'float', origin: 'kernel', functions: {}, structs: []
      },
      string: {
        name: 'string', origin: 'kernel', functions: {}, structs: []
      }
    }
  }
}

const testingGenerator = () => new ModuleGenerator('virtual',
  x => typeof x === 'string' ? modules[x] : modules[x[0]]
);

export function createParserFor(code: string, generator?: ModuleGenerator): ModuleParser {
  const tokenizer = new Tokenizer();
  if (!generator)
    generator = testingGenerator();
  return new ModuleParser(tokenizer.getTokenList(code), generator);
}

export function fastParse(code: string, generator?: ModuleGenerator): ModuleParser {
  const parser = createParserFor(code, generator);
  parser.parse();
  return parser;
}

export function fastParseGenerate(code: string) {
  const generator = testingGenerator();
  fastParse(code, generator);
  generator.generateModule();
}