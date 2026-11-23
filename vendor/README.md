# D2 browser compiler

The tarball contains the upstream browser bundle, TypeScript declarations and
license notices from [D2 at 710a5d7](https://github.com/d2lang/d2/tree/710a5d7bdb71871bbf2e6792ee72e147c97f4d71/d2js/js).
This revision includes the [WebKit worker startup fix](https://github.com/d2lang/d2/pull/2965)
needed for iOS. The published npm version 0.1.34 predates the fix. The JavaScript
bundle embeds both the worker and the WebAssembly compiler.

Normal plugin builds use the checked-in tarball via Yarn. To regenerate it, use
a clean D2 checkout at the commit above with Go 1.27.4, TinyGo 0.44.0, Binaryen
133, Bun 1.4.5 and Node.js 24 with npm 11.19.1. Run this from the plugin checkout.

```sh
./ci/vendor-d2.sh /path/to/d2
```
