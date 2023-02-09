import { assertThrows, assertEquals } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import { createParserFor } from "./common_test.ts";

Deno.test('must parse', () => {
  assertEquals(createParserFor('int{4}').parseType(),
    { base: ['int'], meta: { line: 1 }, array: { size: 4 } }
  ); 
  assertEquals(createParserFor('[int{}, float]').parseType(),
    { base: [
      { base: ['int'], meta: { line: 1 }, array: { size: undefined} },
      { base: ['float'], meta: { line: 1 }, array: undefined }
      ], meta: { line: 1 }, array: undefined
    }
  ); 
  assertEquals(createParserFor('.b.c').parseName('a'), ['a', 'b', 'c']); 
  assertEquals(createParserFor('int a, float{}, _ var)').parseHeuristicList({ value: ')' }), [
    { name: 'a', meta: { line: 1 }, type: { base: ['int'],  meta: { line: 1 }, array: undefined } },
    { name: null, meta: { line: 1 }, type: { base: ['float'],  meta: { line: 1 }, array: { size: undefined } }},
    { name: 'var', meta: { line: 1 }, type: null },
  ]);
  {
    const expr = createParserFor('int x, string y) () . end');
    assertEquals(expr.parseArgList({ value: ')' }), [
      { name: 'x', meta: { line: 1 }, type: { base: ['int'],  meta: { line: 1 }, array: undefined } },
      { name: 'y', meta: { line: 1 }, type: { base: ['string'], meta: { line: 1 }, array: undefined } },
    ]);
    assertEquals(expr.remain(), ['(', ')', '.', 'end'].map(x => { return { type: 'keyword', value: x, line: 1 } }));
  }
  assertEquals(createParserFor('true').tryParseLiteral(), { type: 'bool', meta: { line: 1 }, value: 'true' });
  assertEquals(createParserFor('! . + .').parseExpression(), {
    id: 'call', func: ['+'], meta: { line: 1 },
    args: [{ id: 'call', func: ['!'], args: [{ id: 'none', meta: { line: 1 } }], meta: { line: 1 } }, { id: 'none', meta: { line: 1 } }]
  });
  assertEquals(createParserFor('a.b(f.g, 3) * .').parseExpression(), { id: 'call', func: ['*'], args: [
    {
      id: 'call', func: ['a', 'b'], meta: { line: 1 },
      args: [
        { id: 'value', of: ['f', 'g'], meta: { line: 1 }},
        { id: 'literal', meta: { line: 1 }, value: { type: 'int', value: '3', meta: { line: 1 } } }
      ]
    },
    { id: 'none', meta: { line: 1 } }
  ], meta: { line: 1 } });
  assertEquals(createParserFor('++a.b.c(false) / .').parseExpression(), { id: 'call', func: ['/'], args: [
    { id: 'call', func: ['++'], args: [
      { id: 'call', func: ['a', 'b', 'c'], args: [
        { id: 'literal', value: { type: 'bool', value: 'false', meta: { line: 1 } }, meta: { line: 1 } }
      ], meta: { line: 1 } }
    ], meta: { line: 1 } },
    { id: 'none', meta: { line: 1 } }
  ], meta: { line: 1 } });
  assertEquals(createParserFor('2 + if smt.fn() then 1 else 0 end').parseExpression(), { id: 'call', func: ['+'], args: [
    { id: 'literal', value: { type: 'int', value: '2', meta: { line: 1 } }, meta: { line: 1 } },
    { id: 'if', meta: { line: 1 },
      cond: { id: 'call', func: ['smt', 'fn'], args: [], meta: { line: 1 } },
      then: { id: 'literal', meta: { line: 1 }, value: { type: 'int', value: '1', meta: { line: 1 } } },
      else: { id: 'literal', meta: { line: 1 }, value: { type: 'int', value: '0', meta: { line: 1 } } }
    }
  ], meta: { line: 1 } });
  assertEquals(createParserFor('if a then b else if c then d else e end').parseExpression(), {
    id: 'if', meta: { line: 1 },
    cond: { id: 'value', of: ['a'], meta: { line: 1 } },
    then: { id: 'value', of: ['b'], meta: { line: 1 } },
    else: {
      id: 'if', meta: { line: 1 },
      cond: { id: 'value', of: ['c'], meta: { line: 1 } },
      then: { id: 'value', of: ['d'], meta: { line: 1 } },
      else: { id: 'value', of: ['e'], meta: { line: 1 } }
    }
  });
  assertEquals(createParserFor('a.c[b.c(),2,"hello"].x.y').parseExpression(), {
    id: 'get', name: ['x', 'y'], meta: { line: 1 }, origin: {
      id: 'index', meta: { line: 1 }, origin: { id: 'value', of: ['a', 'c'], meta: { line: 1 } }, args: [
        { id: 'call', func: ['b', 'c'], args: [], meta: { line: 1 } },
        { id: 'literal', value: { value: '2', type: 'int', meta: { line: 1 } }, meta: { line: 1 } },
        { id: 'literal', value: { value: 'hello', type: 'string', meta: { line: 1 } }, meta: { line: 1 } }
      ]
    }
  });
});

Deno.test('must not parse', () => {
  assertThrows(() => createParserFor('string{').parseType());
  assertThrows(() => createParserFor('int a, float').parseHeuristicList({ value: ')' }));
  assertThrows(() => createParserFor('int a, _)').parseArgList({ value: ')' }))
});