import { assertThrows } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import { ParserError } from "../errors.ts";
import { Module, Func, I32, Bool, F64 } from "../sapp.ts";
import { Generator } from './generator.ts'

const generator = new Generator();

const add: Func = {
  inputSignature: [I32, I32],
  outputSignature: I32,
  source: 0
}

const mult: Func = {
  ...add,
  source: 1
}

const greater: Func = {
  ...add,
  outputSignature: Bool,
  source: 2
}

const addf: Func = {
  inputSignature: [F64, F64],
  outputSignature: F64,
  source: 0
}

const multf: Func = {
  ...addf,
  source: 1
}

generator.overwriteKernel({
  route: 'kernel:test',
  defs: new Map([
    ['+', {
      name: '+',
      route: 'kernel:test',
      instanceOverloads: 0,
      funcs: new Map([['', [add, addf]]]),
      instanceFuncs: new Map()
    }],
    ['*', {
      name: '*',
      route: 'kernel:test',
      instanceOverloads: 0,
      funcs: new Map([['', [mult, multf]]]),
      instanceFuncs: new Map()
    }],
    ['>', {
      name: '>',
      route: 'kernel:test',
      instanceOverloads: 0,
      funcs: new Map([['', [greater]]]),
      instanceFuncs: new Map()
    }]
  ]),
  exports: []
})

const genTest = (src: string): Module => generator.generateModule('virtual:test', src);

Deno.test('must generate, expression targeted', () => {
  const codes = [
    `def Test
      f(i32 z) z;
      a(i32 x) if true then (y = f(2), f(y)) else 5 end;
      b(i32 x, i32 y) z = Test.a(x + y), Test.a(z);
    end`,
    `def Test
      f(i32 a, i32 b) a + b;
      smt(i32 x): i32 (y = f(x, x), smt(x + y))
    end`,
    `def Test
      f(i32 a, i32 b) a + b;
      smt(i32 x): i32 if x > 100 then (
          y = f(x, x),
          smt(x + y)
        ) else x end
    end`,
    `def **
      (i32 a, i32 b) (a * a) + (b * b)
    end
    def Test someFunc(i32 x, i32 y)
      z = x + y,
      z ** 2
    end`,
    `def Test
      ([i32, i64] a): [i32, i64] Test(a), a;
      (): i32{} {3, 10};
    end`,
    `def TestStructs
      struct i32;
      struct f64;
      (i32 i): TestStructs new[i];
      (f64 i): TestStructs new[i];
      [i32 a] pow2(): TestStructs new[a * a];
      [f64 a] pow2(): TestStructs new[a * a];
      [i32 a] obj() this;
      [f64 a] obj() this;
    end`,
    `ensured def Ensured
      hello(i32): string;
    end
    def TestEnsured
      hey(): string Ensured.hello(5)
    end`
    ];
    codes.forEach(genTest);
})

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
    struct string
    struct i32
    [i32] f() .;
    [string] f() .;
    [i32] f(string) .;
    [string] f(string) .;
  end`,
  ];
  codes.forEach(genTest);
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
  codes.forEach(code => assertThrows(() => genTest(code), ParserError));
});