# D2 browser compiler

The tarball contains the upstream browser bundle, TypeScript declarations and
license notices from [D2 at aebb98d](https://github.com/d2lang/d2/tree/aebb98d4444dfaffa72661f79bbcc4fb4d15aebc/d2js/js).
This revision includes the [WebKit worker startup fix](https://github.com/d2lang/d2/pull/2965)
needed for iOS and the [formatter round-trip fixes](https://github.com/d2lang/d2/pull/3043)
that preserve imported boards and their declaration order. The JavaScript bundle
embeds both the worker and the WebAssembly compiler.

Normal plugin builds use the checked-in tarball via Yarn. To regenerate it, use
a clean D2 checkout at the commit above with Go 1.27.4, TinyGo 0.44.0, Binaryen
133, Bun 1.4.5 and Node.js 24 with npm 11.19.0. Run this from the plugin checkout.

```sh
./ci/vendor-d2.sh /path/to/d2
```
