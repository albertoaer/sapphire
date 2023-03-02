import { assertThrows, assertEquals } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import { parserFor } from "./test_utils.ts";

Deno.test('must parse', () => {
  const meta = { line: 1 };

  assertEquals(parserFor('int{4}').parseType(),
    { base: { route: ['int'], meta }, meta, array: { size: 4 } }
  ); 
  assertEquals(parserFor('[int{}, float]').parseType(),
    { base: [
      { base: { route: ['int'], meta }, meta, array: { size: undefined} },
      { base: { route: ['float'], meta }, meta, array: undefined }
      ], meta, array: undefined
    }
  ); 
  assertEquals(parserFor('.b.c').parseName('a'), ['a', 'b', 'c']); 
  assertEquals(parserFor('int a, float{}, _ var)').parseHeuristicList({ value: ')' }), [
    { name: 'a', meta, type: { base: { route: ['int'], meta },  meta, array: undefined } },
    { name: null, meta, type: { base: { route: ['float'], meta },  meta, array: { size: undefined } }},
    { name: 'var', meta, type: null },
  ]);
  {
    const expr = parserFor('int x, string y) () . end');
    assertEquals(expr.parseArgList({ value: ')' }), [
      { name: 'x', meta, type: { base: { route: ['int'], meta },  meta, array: undefined } },
      { name: 'y', meta, type: { base: { route: ['string'], meta }, meta, array: undefined } },
    ]);
    assertEquals(expr.remain(), ['(', ')', '.', 'end'].map(x => { return { type: 'keyword', value: x, line: 1 } }));
  }
  assertEquals(parserFor('true').tryParseLiteral(), { type: 'bool', meta, value: 'true' });
  assertEquals(parserFor('! . + .').parseExpression(), {
    id: 'call', func: { route: ['+'], meta }, meta,
    args: [{ id: 'call', func: { route: ['!'], meta }, args: [{ id: 'none', meta }], meta }, { id: 'none', meta }]
  });
  assertEquals(parserFor('a.b(f.g, 3) * .').parseExpression(), {
    id: 'call', func: { route: ['*'], meta }, args: [
      {
        id: 'call', func: { route: ['a', 'b'], meta }, meta,
        args: [
          { id: 'value', name: { route: ['f', 'g'], meta }, meta},
          { id: 'literal', meta, value: { type: 'i32', value: '3', meta } }
        ]
      },
      { id: 'none', meta }
  ], meta });
  assertEquals(parserFor('++a.b.c(false) / .').parseExpression(), {
    id: 'call', func: { route: ['/'], meta }, args: [
      { id: 'call', func: { route: ['++'], meta }, args: [
        { id: 'call', func: { route: ['a', 'b', 'c'], meta }, args: [
          { id: 'literal', value: { type: 'bool', value: 'false', meta }, meta }
        ], meta }
      ], meta },
      { id: 'none', meta }
  ], meta });
  assertEquals(parserFor('2 + if smt.fn() then 1^ else 0^ end').parseExpression(), {
    id: 'call', func: { route: ['+'], meta }, args: [
      { id: 'literal', value: { type: 'i32', value: '2', meta }, meta },
      { id: 'if', meta,
        cond: { id: 'call', func: { route: ['smt', 'fn'], meta }, args: [], meta },
        then: { id: 'literal', meta, value: { type: 'i64', value: '1', meta } },
        else: { id: 'literal', meta, value: { type: 'i64', value: '0', meta } }
      }
  ], meta });
  assertEquals(parserFor('if a then b else if c then d else e end').parseExpression(), {
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
  assertEquals(parserFor('a.c[b.c(),2,"hello"].x.y').parseExpression(), {
    id: 'get', name: { route: ['x', 'y'], meta }, meta, origin: {
      id: 'index', meta, origin: { id: 'value', name: { route: ['a', 'c'], meta }, meta }, args: [
        { id: 'call', func: { route: ['b', 'c'], meta }, args: [], meta },
        { id: 'literal', value: { value: '2', type: 'i32', meta }, meta },
        { id: 'literal', value: { value: 'hello', type: 'string', meta }, meta }
      ]
    }
  });
  assertEquals(parserFor('a = (4.4^ * b.c)').parseExpression(), {
    id: 'assign', name: { meta, route: ['a'] },
    value: {
      id: 'call', func: { meta, route: ['*'] },
      args: [ 
        { id: 'literal', value: { meta, type: 'f64', value: '4.4' }, meta },
        { id: "value", name: { meta, route: ['b', 'c'] }, meta }
      ],
      meta
    }, meta
  });
  assertEquals(parserFor('new[2] + new[smt()]').parseExpression(), {
    id: 'call', func: { meta, route: ['+'] },
    meta, args: [
      { id: 'build', args: [ { id: 'literal', meta, value: { meta, type: 'i32', value: '2' } } ], meta },
      { id: 'build', args: [ { id: 'call', meta, func: { meta, route: ['smt'] }, args: [] } ], meta },
    ]
  })
});

Deno.test('must not parse', () => {
  assertThrows(() => parserFor('string{').parseType());
  assertThrows(() => parserFor('int a, float').parseHeuristicList({ value: ')' }));
  assertThrows(() => parserFor('int a, _)').parseArgList({ value: ')' }))
});