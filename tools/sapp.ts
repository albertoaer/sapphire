/**
 * sapp is prepared for running any Sapphire compatible file
 * That includes:
 *  - source .sa files
 *  - wasm compiled
 */
import type { Compiler } from '../compiler/compiler.ts';
import { WasmCompiler } from '../compiler/sapp_wasm/mod.ts';
import { WasmVM } from '../compiler/wasm_vm/mod.ts';
import { FileSystemModuleProvider } from '../compiler/deps.ts';

const [file, ...args] = Deno.args;

const fsp = new FileSystemModuleProvider();
const compiler: Compiler = new WasmCompiler(fsp);
const entry_point = "main0";

try {
  
  const code = compiler.compile(file);
  const vm = await WasmVM.create(code);
  const fn = vm.exports[entry_point] as CallableFunction | undefined;

  if (!fn) throw new Error(`Expecting entry point ${entry_point}`);
  else fn(args);

} catch (err) {
  console.error(err);
}