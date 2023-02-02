import { assertThrows, assertEquals } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import { createParserFor, modules } from "./common_test.ts";

Deno.test('must parse', () => {
  assertEquals(createParserFor('int{4}').parseType(),
    { base: ['int'], line: 1, array: { size: 4 } }
  ); 
  assertEquals(createParserFor('[int{}, float]').parseType(),
    { base: [
      { base: ['int'], line: 1, array: { size: undefined} },{ base: ['float'], line: 1, array: undefined }
      ], line: 1, array: undefined
    }
  ); 
  assertEquals(createParserFor('.b.c').parseName('a'), ['a', 'b', 'c']); 
  assertEquals(createParserFor('int a, float{}, _ var)').parseHeuristicList({ value: ')' }), [
    { name: 'a', type: { base: ['int'], line: 1, array: undefined } },
    { name: null, type: { base: ['float'], line: 1, array: { size: undefined } }},
    { name: 'var', type: null },
  ]);
  {
    const expr = createParserFor('int x, string y) () . end');
    assertEquals(expr.parseArgList({ value: ')' }), [
      { name: 'x', type: { base: ['int'], line: 1, array: undefined } },
      { name: 'y', type: { base: ['string'], line: 1, array: undefined } },
    ]);
    assertEquals(expr.remain(), ['(', ')', '.', 'end'].map(x => { return { type: 'keyword', value: x, line: 1 } }));
  }
  assertEquals(createParserFor('true').tryParseLiteral(), { type: modules['kernel']['defs']['bool'], value: 'true' });
  assertEquals(createParserFor('! . + .').parseExpression(), {
    id: 'call', func: ['+'],
    args: [{ id: 'call', func: ['!'], args: [{ id: 'none' }] }, { id: 'none' }]
  });
  assertEquals(createParserFor('a.b(f.g, 3) * .').parseExpression(), { id: 'call', func: ['*'], args: [
    {
      id: 'call', func: ['a', 'b'],
      args: [
        { id: 'value', of: ['f', 'g'] },
        { id: 'literal', value: { type: modules['kernel']['defs']['int'], value: '3' } }
      ]
    },
    { id: 'none' }
  ] });
  assertEquals(createParserFor('++a.b.c(false) / .').parseExpression(), { id: 'call', func: ['/'], args: [
    { id: 'call', func: ['++'], args: [
      { id: 'call', func: ['a', 'b', 'c'], args: [
        { id: 'literal', value: { type: modules['kernel']['defs']['bool'], value: 'false' } }
      ] }
    ] },
    { id: 'none' }
  ] });
  assertEquals(createParserFor('2 + if smt.fn() then 1 else 0 end').parseExpression(), { id: 'call', func: ['+'], args: [
    { id: 'literal', value: { type: modules['kernel']['defs']['int'], value: '2' } },
    { id: 'if',
      cond: { id: 'call', func: ['smt', 'fn'], args: [] },
      then: { id: 'literal', value: { type: modules['kernel']['defs']['int'], value: '1' } },
      else: { id: 'literal', value: { type: modules['kernel']['defs']['int'], value: '0' } } }
  ] });
  assertEquals(createParserFor('if a then b else if c then d else e end').parseExpression(), {
    id: 'if',
    cond: { id: 'value', of: ['a'] },
    then: { id: 'value', of: ['b'] },
    else: {
      id: 'if',
      cond: { id: 'value', of: ['c'] },
      then: { id: 'value', of: ['d'] },
      else: { id: 'value', of: ['e'] }
    }
  });
  assertEquals(createParserFor('a.c[b.c(),2].x.y').parseExpression(), {
    id: 'get', name: ['x', 'y'], origin: {
      id: 'index', origin: { id: 'value', of: ['a', 'c'] }, args: [
        { id: 'call', func: ['b', 'c'], args: [] },
        { id: 'literal', value: { value: '2', type: modules['kernel']['defs']['int'] } }
      ]
    }
  });
});

Deno.test('must not parse', () => {
  assertThrows(() => createParserFor('string{').parseType());
  assertThrows(() => createParserFor('int a, float').parseHeuristicList({ value: ')' }));
  assertThrows(() => createParserFor('int a, _)').parseArgList({ value: ')' }))
});