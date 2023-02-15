export interface Compiler {
  compile(file: string): Uint8Array;
}