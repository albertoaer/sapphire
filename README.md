# Sapphire

Experimental WebAssembly targeted programming language

Sapphire parser is fully independent of the WASM compiler, allowing new compilation targets in the future

## Hello World

Sapphire strings are encoded into the WebAssembly Memory meanwhile Js console.log expects a Js string. In order to print "Hello World!", Sapphire must convert it string into a reference.

```
ensured def console
  log(ref): void;
end

export def main()
  console.log("Hello World!":str_ref)
end
```

Instead of loading the `console.log` function, a newer introduction is the `kernel.echo` function

```
export def main()
  "Hello World!":str_ref:echo
end
```

## Documentation

The [Language Documentation](docs/lang.md) with syntaxis, features and technical description