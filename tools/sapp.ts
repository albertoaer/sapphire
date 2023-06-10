const INFO = `
  Sapp is prepared for running any Sapphire compatible file
    That includes:
      - source .sa files
      - wasm compiled [not yet!]
    
    How to use it:
      $ sapp <SOURCE> [...args]

    Location:
      ${Deno.execPath()}
`
import type { Compiler } from '../compiler/compiler.ts';
import { WasmCompiler } from '../compiler/sapp_wasm/mod.ts';
import { WasmVM } from '../compiler/wasm_vm/mod.ts';
import { FileSystemModuleProvider } from '../compiler/filesystem_module_provider.ts';

const [file, ...args] = Deno.args;

if (!file) {
  console.log(INFO);
} else {
  const compiler: Compiler = new WasmCompiler();
  const fsp = new FileSystemModuleProvider(compiler.createGenerator());
  const entry_point = "main0";

  try {
    
    const code = await compiler.compile(fsp, file);
    const vm = await WasmVM.create(code);
    const fn = vm.exports[entry_point] as CallableFunction | undefined;

    if (!fn) throw new Error(`Expecting entry point ${entry_point}`);
    else fn(args);

  } catch (err) {
    console.error(err);
  }
}