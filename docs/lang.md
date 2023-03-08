# Sapphire

Currently Sapphire is in a very early stage, so many of the features are still in progress

# Data types

- numeric types: `i32` `i64` `f32` `f64`
  - Wasm numeric types wrappers
- `string` **unimplemented yet** internally represed as an `i32`
- `bool` internally represented as an `i32`
- `void` represents the absence of a value
- `any` utility type used by the kernel, cannot be compiled
- `tuples` and `lists` **unimplemented yet**

# Comments

Comments are performed through # and #~ #
```
# One line comment

#~
  Multi
  Line
  Comment
#
```

# Definitions

A definition is the main layer of abstraction in Sapphire, a black box that exports functions and can be used as a type

Internally can create objects that matches its type

Its similar to a class without inheritance and more than one posible internal state, called struct

```
def NumberWrapper
  struct i32;
  struct f32;

  [i32 n] i32() n;
  [f32 n] i32() n:i32;

  [i32 n] f32() n:f32;
  [f32 n] f32() n;
end
```

The notation *expr:function* is a shortcut for *function(expr)*

## Expressions

Functions are recommended to be separated by a semicolon, but expressions are forced to be separated by a colon

Last element is the one returned

```
def operation(i32 a)
  b = calculate(a, a),
  c = something(b),
  operate(c, a)
end
```

## Ensured definitions

Allow calling native methods provided to the module

```
ensured def console
  log(i32 value): void; # References JS console.log
end
```

## Extend definitions

Definitions can include functions from other definitions

```
def Output extends console end
```

## Redeclare definitions

Definitions can be redeclared, a very powerfull mechanism to extend existing behaviour with custom logic

```
def f32(bool v): f32 v:i32:f32
  extends kernel.f32
end
```

Another example forcing a redefinition in an operator

```
def *
  extends kernel.*;

  force (i32 a, i32 b): i32 a + b
end
```

As you might already notice Sapphire syntax is very flexible

# Imports

In order to imports definitions from another module
there are two ways

Loading into the current module all the definitions

```
use route.to.module into
```

Loading the module under a name

```
use route.to.moduleA
use route.to.moduleB as renamed

def main() moduleA.smt() + renamed.smt() end
```

The last imported modules/definitions will overwrite those that had the same name

In order to prevent from exporting non desired definitions and functions, use `priv`

```
priv def myInternalFunction() . end

def MySharedFunction
  // Will only operate with i32 outside the module
  (i32) . ;
  priv (f32) . ;
end
```

The keyword `export` expose a whole definition to the environment where the module is executed, ensure the definition is at the root of the main module, otherwise wont work

```
export def main()
  .
end
```