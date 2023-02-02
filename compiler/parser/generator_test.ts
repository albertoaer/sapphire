import { assertThrows } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import { fastParseGenerate } from "./common_test.ts";
import { ParserError } from "./common.ts";

Deno.test('must generate', () => {
  const codes = [
    `def Test
    struct string
    struct int
    [int] f() .;
    [string] f() .;
    [int] f(string) .;
    [string] f(string) .;
  end`,
  `def Test
    struct string;
    [string] f() .;
    struct int
    [int] f() .;
  end`,
  `def Test
    f(int a, int b) a + b;
    smt(int x) (
        y = f(x, x),
        smt(x + y)
      )
  end`,
  `def Test
    f(int a, int b) a + b;
    smt(int x) if x > 100 then (
        y = f(x, x),
        smt(x + y)
      ) else x end
  end`,
  `def Test(string x) getAFunction()[x] end`,
  `def Test someFunc(int x, int y)
    z = x + y,
    z * 2
  end`
  ];
  codes.forEach(fastParseGenerate);
});

Deno.test('must not generate', () => {
  const codes = [
    `def Test
    struct 0;
    [0] f(int) 0;
    [0] f(int) 1;
  end`,
  `def Test
    struct string
    struct string
  end`,
  `def Test
    struct string
    struct int
    [int] f() .;
    [string] f() .;
    [string] f(string) .;
  end`
  ];
  codes.forEach(code => assertThrows(() => fastParseGenerate(code), ParserError));
});