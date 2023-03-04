import { parse } from "https://deno.land/std@0.168.0/flags/mod.ts";

const parsed = parse(Deno.args, {
  boolean: ['print', 'help'],
  string: ['output', 'call'],
  alias: {
    'o': 'output',
    'p': 'print',
    'c': 'call'
  },
  default: { print: false, help: false, output: null, call: null }
});

if (parsed.help) {
  console.log(`
    sapp [options] [file] [args]
  
    options:

    --help,     : Print help information
    --print  -p : Print the compiled code
    --output -o : File to write the compiled code in 
    --call   -c : Calls a exported function
  `)
}

export default {
  print: parsed.print,
  file: parsed._.at(0)?.toString() ?? null,
  args: parsed._.slice(1),
  output: parsed.output,
  call: parsed.call
};