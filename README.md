# Sapphire

Experimental WebAssembly targeted programming language

Sapphire parser is fully independent of the WASM compiler, allowing new compilation targets in the future

## Hello World

Currently there is no support for native JS strings, so here is a small exported sum function that logs the result in the output

```
ensured def console
  log(i32 value): void;
end

export def sum(i32 a, i32 b)
  console.log(a + b)
end
```

## Documentation

The [Language Documentation](docs/lang.md) with syntaxis, features and technical description