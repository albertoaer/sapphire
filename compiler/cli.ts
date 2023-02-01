import { parse } from "https://deno.land/std@0.168.0/flags/mod.ts";

const parsed = parse(Deno.args, {
  boolean: ['print', 'help'],
  string: ['output'],
  alias: {
    'o': 'output',
    'p': 'print'
  },
  default: { print: false, help: false, output: null }
});

if (parsed.help) {
  console.log(`
    sapp [args] [files]
  
    --help,     : Prints help information
    --print  -p : Prints the compiled code
    --output -o : Sets the compiled code output file
  `)
}

export default {
  print: parsed.print,
  files: parsed._.map(String),
  output: parsed.output
};