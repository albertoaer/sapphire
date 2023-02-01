import { assertThrows, assertEquals } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import { createParserFor } from "./commont_test.ts";

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
  assertEquals(createParserFor('int x, string y)').parseArgList({ value: ')' }), [
    { name: 'x', type: { base: ['int'], line: 1, array: undefined } },
    { name: 'y', type: { base: ['string'], line: 1, array: undefined } },
  ]);
});

Deno.test('must not parse', () => {
  assertThrows(() => createParserFor('string{').parseType());
  assertThrows(() => createParserFor('int a, float').parseHeuristicList({ value: ')' }));
  assertThrows(() => createParserFor('int a, _)').parseArgList({ value: ')' }))
});