import { assertEquals, assertThrows } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import { Tokenizer } from './tokenizer.ts';

Deno.test("tokens", () => {
  const tk = new Tokenizer();

  assertEquals(tk.getTokens("1+1."), [
    { line: 1, type: 'int', value: '1' },
    { line: 1, type: 'operator', value: '+' },
    { line: 1, type: 'float', value: '1.' }
  ]);

  assertEquals(tk.getTokens("def hello(a) \"hello \" +a end"), [
    { line: 1, type: 'keyword', value: 'def' },
    { line: 1, type: 'identifier', value: 'hello' },
    { line: 1, type: 'keyword', value: '(' },
    { line: 1, type: 'identifier', value: 'a' },
    { line: 1, type: 'keyword', value: ')' },
    { line: 1, type: 'string', value: 'hello ' },
    { line: 1, type: 'operator', value: '+' },
    { line: 1, type: 'identifier', value: 'a' },
    { line: 1, type: 'keyword', value: 'end' }
  ]);

  assertEquals(tk.getTokens("def constant\n\t45\nend"), [
    { line: 1, type: 'keyword', value: 'def' },
    { line: 1, type: 'identifier', value: 'constant' },
    { line: 2, type: 'int', value: '45' },
    { line: 3, type: 'keyword', value: 'end' }
  ]);

  assertEquals(tk.getTokens(";use file.definition"), [
    { line: 1, type: 'keyword', value: ';' },
    { line: 1, type: 'keyword', value: 'use' },
    { line: 1, type: 'identifier', value: 'file' },
    { line: 1, type: 'keyword', value: '.' },
    { line: 1, type: 'identifier', value: 'definition' }
  ]);

  assertEquals(tk.getTokens("desc..1.2.2^ 4..5"), [
    { line: 1, type: 'identifier', value: 'desc' },
    { line: 1, type: 'keyword', value: '.' },
    { line: 1, type: 'float', value: '.1' },
    { line: 1, type: 'float', value: '.2' },
    { line: 1, type: 'float', value: '.2' },
    { line: 1, type: 'keyword', value: '^' },
    { line: 1, type: 'float', value: '4.' },
    { line: 1, type: 'float', value: '.5' }
  ]);

  assertEquals(tk.getTokens("def # this does not matter is a comment\nmatters"), [
    { line: 1, type: 'keyword', value: 'def' },
    { line: 2, type: 'identifier', value: 'matters' }
  ]);

  assertEquals(tk.getTokens(`
  (bool x),
    false true
  ;
  `), [
    { line: 2, type: 'keyword', value: '(' },
    { line: 2, type: 'identifier', value: 'bool' },
    { line: 2, type: 'identifier', value: 'x' },
    { line: 2, type: 'keyword', value: ')' },
    { line: 2, type: 'keyword', value: ',' },
    { line: 3, type: 'keyword', value: 'false' },
    { line: 3, type: 'keyword', value: 'true' },
    { line: 4, type: 'keyword', value: ';' },
  ]);

  assertEquals(tk.getTokens(`
  x = true #~ + 
    45.6
  #;{}"hey
  you"
  `), [
    { line: 2, type: 'identifier', value: 'x' },
    { line: 2, type: 'keyword', value: '=' },
    { line: 2, type: 'keyword', value: 'true' },
    { line: 4, type: 'keyword', value: ';' },
    { line: 4, type: 'keyword', value: '{' },
    { line: 4, type: 'keyword', value: '}' },
    { line: 5, type: 'string', value: 'hey\n  you' },
  ])
});

Deno.test("tokenization error", () => {
  const tk = new Tokenizer();

  assertThrows(() => tk.getTokens(`\"`))
})