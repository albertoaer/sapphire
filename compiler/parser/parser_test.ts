import { assertThrows, assertEquals } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import { createParserFor } from "./test_utils.ts";

Deno.test('must parse', () => {
  const meta = { line: 1 };

  assertEquals(createParserFor('int{4}').parseType(),
    { base: { route: ['int'], meta }, meta, array: { size: 4 } }
  ); 
  assertEquals(createParserFor('[int{}, float]').parseType(),
    { base: [
      { base: { route: ['int'], meta }, meta, array: { size: undefined} },
      { base: { route: ['float'], meta }, meta, array: undefined }
      ], meta, array: undefined
    }
  ); 
  assertEquals(createParserFor('.b.c').parseName('a'), ['a', 'b', 'c']); 
  assertEquals(createParserFor('int a, float{}, _ var)').parseHeuristicList({ value: ')' }), [
    { name: 'a', meta, type: { base: { route: ['int'], meta },  meta, array: undefined } },
    { name: null, meta, type: { base: { route: ['float'], meta },  meta, array: { size: undefined } }},
    { name: 'var', meta, type: null },
  ]);
  {
    const expr = createParserFor('int x, string y) () . end');
    assertEquals(expr.parseArgList({ value: ')' }), [
      { name: 'x', meta, type: { base: { route: ['int'], meta },  meta, array: undefined } },
      { name: 'y', meta, type: { base: { route: ['string'], meta }, meta, array: undefined } },
    ]);
    assertEquals(expr.remain(), ['(', ')', '.', 'end'].map(x => { return { type: 'keyword', value: x, line: 1 } }));
  }
  assertEquals(createParserFor('true').tryParseLiteral(), { type: 'bool', meta, value: 'true' });
  assertEquals(createParserFor('! . + .').parseExpression(), {
    id: 'call', func: { route: ['+'], meta }, meta,
    args: [{ id: 'call', func: { route: ['!'], meta }, args: [{ id: 'none', meta }], meta }, { id: 'none', meta }]
  });
  assertEquals(createParserFor('a.b(f.g, 3) * .').parseExpression(), {
    id: 'call', func: { route: ['*'], meta }, args: [
      {
        id: 'call', func: { route: ['a', 'b'], meta }, meta,
        args: [
          { id: 'value', name: { route: ['f', 'g'], meta }, meta},
          { id: 'literal', meta, value: { type: 'int', value: '3', meta } }
        ]
      },
      { id: 'none', meta }
  ], meta });
  assertEquals(createParserFor('++a.b.c(false) / .').parseExpression(), {
    id: 'call', func: { route: ['/'], meta }, args: [
      { id: 'call', func: { route: ['++'], meta }, args: [
        { id: 'call', func: { route: ['a', 'b', 'c'], meta }, args: [
          { id: 'literal', value: { type: 'bool', value: 'false', meta }, meta }
        ], meta }
      ], meta },
      { id: 'none', meta }
  ], meta });
  assertEquals(createParserFor('2 + if smt.fn() then 1 else 0 end').parseExpression(), {
    id: 'call', func: { route: ['+'], meta }, args: [
      { id: 'literal', value: { type: 'int', value: '2', meta }, meta },
      { id: 'if', meta,
        cond: { id: 'call', func: { route: ['smt', 'fn'], meta }, args: [], meta },
        then: { id: 'literal', meta, value: { type: 'int', value: '1', meta } },
        else: { id: 'literal', meta, value: { type: 'int', value: '0', meta } }
      }
  ], meta });
  assertEquals(createParserFor('if a then b else if c then d else e end').parseExpression(), {
    id: 'if', meta,
    cond: { id: 'value', name: { route: ['a'], meta }, meta },
    then: { id: 'value', name: { route: ['b'], meta }, meta },
    else: {
      id: 'if', meta,
      cond: { id: 'value', name: { route: ['c'], meta }, meta },
      then: { id: 'value', name: { route: ['d'], meta }, meta },
      else: { id: 'value', name: { route: ['e'], meta }, meta }
    }
  });
  assertEquals(createParserFor('a.c[b.c(),2,"hello"].x.y').parseExpression(), {
    id: 'get', name: { route: ['x', 'y'], meta }, meta, origin: {
      id: 'index', meta, origin: { id: 'value', name: { route: ['a', 'c'], meta }, meta }, args: [
        { id: 'call', func: { route: ['b', 'c'], meta }, args: [], meta },
        { id: 'literal', value: { value: '2', type: 'int', meta }, meta },
        { id: 'literal', value: { value: 'hello', type: 'string', meta }, meta }
      ]
    }
  });
});

Deno.test('must not parse', () => {
  assertThrows(() => createParserFor('string{').parseType());
  assertThrows(() => createParserFor('int a, float').parseHeuristicList({ value: ')' }));
  assertThrows(() => createParserFor('int a, _)').parseArgList({ value: ')' }))
});