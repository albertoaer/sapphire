import { assertThrows } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import { ParserError } from "./common.ts";
import { getModule } from "./test_utils.ts";

Deno.test('must generate, types targeted', () => {
  const codes = [
  `def TestA() . end
  def TestB
    (TestA) .
  end`,
  `def Test
    struct string;
    [string] f() .;
    struct i32
    [i32] f() .;
  end`,
  `def Test
    f(i32 a, i32 b) a + b;
    smt(i32 x) (
        y = f(x, x),
        smt(x + y)
      )
  end`,
  `def Test
    f(i32 a, i32 b) a + b;
    smt(i32 x) if x > 100 then (
        y = f(x, x),
        smt(x + y)
      ) else x end
  end`,
  `def Test someFunc(i32 x, i32 y)
    z = x + y,
    z * 2
  end`,
  `def Test
    struct string
    struct i32
    [i32] f() .;
    [string] f() .;
    [i32] f(string) .;
    [string] f(string) .;
  end`,
  ];
  codes.forEach(getModule);
});

Deno.test('must not generate, types targeted', () => {
  const codes = [
  `def TestA end
  def TestB
    (TestC) .
  end`,
  `def Test
    struct 0;
    [0] f(i32) 0;
    [0] f(i32) 1;
  end`,
  `def Test
    struct string
    struct string
  end`,
  `def Test
    struct string
    struct i32
    [i32] f() .;
    [string] f() .;
    [string] f(string) .;
  end`
  ];
  codes.forEach(code => assertThrows(() => getModule(code), ParserError));
});