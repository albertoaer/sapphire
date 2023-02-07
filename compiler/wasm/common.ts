export class CompilerError extends Error {
  constructor(msg: string) {
    super(`Wasm compiler error: ${msg}`);
  }
}