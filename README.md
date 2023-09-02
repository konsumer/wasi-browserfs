# wasi-browserfs

A light [WASI](https://wasi.dev/) for browsers, that uses BrowserFS.

I saw a few [WASI](https://wasi.dev/) implementations for browsers, but they all seemed a bit heavy, complicated, and I could not get them working for my purposes, so I made my own.

[BrowserFS](https://github.com/jvilk/BrowserFS) allows you to merge multiple filesystems (for example read zip, but write to localstorage) so you can write code in your favorite language that supports WASI, and run it in browsers (and also native.)

It has dependencies on [BrowserFS](https://github.com/jvilk/BrowserFS) and [cmem_helpers](https://github.com/konsumer/cmem_helpers), which are both pretty easy to setup with/without a package-manager, and are both otherwise useful for wasm stuff.

You will need to export `memory` & `malloc` in your wasm.

You can easily override how the filesystem works, and also overwrite any individual method, if you want to control things, more.

In adition to filesystem functions, it also includes all the regular WASI stuff, like random numbers and system-clock and things. No networking or anything else, but you can add that , if you need it.


## usage

The basic idea is that you initialize it, then give it access to the module, then call your `_start` function.

You can see [index.html](index.html) for a minimal example.

### installation

#### npm

If you are using a bundler like vite/parcel/webpack/etc you can just install it:

```
npm i wasi-browserfs
```

#### browser

Modern browsers support [importmaps](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap), so if you are not using a bundler, you can do this:

```html
<script type="importmap">
{
  "imports": {
    "browserfs": "https://cdn.jsdelivr.net/npm/browserfs@1.4.3/+esm",
    "cmem_helpers": "https://cdn.jsdelivr.net/npm/cmem_helpers@0.0.6/+esm",
    "wasi-browserfs": "https://cdn.jsdelivr.net/npm/wasi-browserfs/+esm"
  }
}
</script>
<script type="module">
  // YOUR CODE HERE
</script>
```

### initialize

Then use it in your code:

```js
import { setup, getFs, Buffer } from 'wasi-browserfs'

// this sets up the filesystem
// in this case it's a merged zip/localstorage system
const fs = await getFs({
  fs: 'OverlayFS',
  options: {
    readable: {
      fs: 'ZipFS',
      options: {
        zipData: Buffer.from(await fetch('myzip.zip').then(r => r.arrayBuffer()))
      }
    },
    writable: {
      fs: 'LocalStorage'
    }
  }
})

// the basic setup. you can modify any of these function you like
const wasi_snapshot_preview1 = setup(fs)

// here you can export your own functions to WASM
const env = {}

const instance = await WebAssembly.instantiateStreaming(fetch("simple.wasm"), { wasi_snapshot_preview1, env })

// you must also give WASI access to memory & malloc, after instantiating
wasi_snapshot_preview1._set_instance(instance)

// now call the WASI initialize/start function (to support the 2 types of WASI init)
if (instance.exports._initialize) {
  instance.exports._initialize
}
if (instance.exports._start){
  instance.exports._start()
}
```

### stdio

The default stdio is just console.log/error but you might prefer to output to a textarea (so it doesn't add a bunch of newlines.) You can override how these are used with simple functions, that just receive text:

```js
// these are your textareas
const tout = document.getElementById('out')
const terr = document.getElementById('err')

const stdout = t => tout.value += t
const stderr = t => terr.value += t

// use this instead of basic setup, above
const wasi_snapshot_preview1 = setup(fs, stdout, stderr)
```

`stdin` is not implemented yet, but I would like to work out a nice solution.
