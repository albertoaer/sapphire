import { assertThrows } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import { ParserError } from "../errors.ts";
import { Module, Func, Type } from "../sapp.ts";
import { Generator } from './generator.ts'

const generator = new Generator();

const add: Func = {
  fullInputSignature: [new Type('i32'), new Type('i32')],
  inputSignature: [new Type('i32'), new Type('i32')],
  locals: [],
  outputSignature: new Type('i32'),
  source: { resolution: 'find', id: 'i32sum' }
}

const mult: Func = {
  ...add,
  source: { resolution: 'find', id: 'i32mult' }
}

const greater: Func = {
  ...add,
  outputSignature: new Type('bool'),
  source: { resolution: 'find', id: 'i32greater' }
}

generator.overwriteKernel({
  route: 'kernel:test',
  defs: {
    '+': {
      name: '+',
      route: 'kernel:test',
      instanceOverloads: 0,
      funcs: { '': [add] },
      instanceFuncs: {}
    },
    '*': {
      name: '*',
      route: 'kernel:test',
      instanceOverloads: 0,
      funcs: { '': [mult] },
      instanceFuncs: {}
    },
    '>': {
      name: '>',
      route: 'kernel:test',
      instanceOverloads: 0,
      funcs: { '': [greater] },
      instanceFuncs: {}
    }
  }
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
    `
    def **
      (i32 a, i32 b) (a * a) + (b * b)
    end
    def Test someFunc(i32 x, i32 y)
      z = x + y,
      z ** 2
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