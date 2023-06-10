import flags from './cli.ts';
import type { Compiler } from './compiler.ts';
import { WasmCompiler } from './sapp_wasm/mod.ts';
import { WasmVM } from './wasm_vm/mod.ts';
import { FileSystemModuleProvider } from './filesystem_module_provider.ts';

if (!flags.file || (!flags.print && !flags.output && !flags.call)) {
  console.log('Nothing to do');
  Deno.exit(-1);
}

const compiler: Compiler = new WasmCompiler();
const fsp = new FileSystemModuleProvider(compiler.createGenerator());

const code = await compiler.compile(fsp, flags.file);

if (flags.print) {
  console.log(...code);
}

if (flags.output) {
  Deno.writeFileSync(flags.output, code);
}

if (flags.call) {
  const vm = await WasmVM.create(code);
  const fn = vm.exports[flags.call] as CallableFunction | undefined;
  if (!fn) console.log('Targeted function does not exists');
  else {
    const ret = fn(...flags.args);
    if (ret !== undefined) console.log(ret);
  }
}