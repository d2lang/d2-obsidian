#!/bin/sh
# Rebuild the browser-only package from a clean checkout of the pinned D2 source.
set -eu
revision=710a5d7bdb71871bbf2e6792ee72e147c97f4d71
vendor=$(cd "$(dirname "$0")/../vendor" && pwd)
cd "${1:?usage: ci/vendor-d2.sh /path/to/d2}"
if [ "$(git rev-parse HEAD)" != "$revision" ] || [ -n "$(git status --porcelain)" ]; then
  echo "Expected a clean D2 checkout at $revision" >&2
  exit 1
fi
git submodule update --init ci/sub
short=$(git rev-parse --short=7 HEAD)
version="$(node -p 'require("./d2js/js/package.json").version')-obsidian.$short"
sdk="$PWD/d2js/js"
export GOWORK=off
GOROOT=$(go env GOROOT)
export GOROOT
mkdir -p "$sdk/wasm"
NPM_VERSION="$version" ./ci/build-wasm.sh "$sdk/wasm/d2.wasm"
cp "$(tinygo env TINYGOROOT)/targets/wasm_exec.js" "$sdk/wasm/wasm_exec.js"
(cd "$sdk" && bun build.js)

staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
cd "$staging"
cp "$sdk/dist/browser/index.js" "$sdk/index.d.ts" "$sdk/LICENSE.txt" "$sdk/THIRD_PARTY_NOTICES.txt" .
cat > package.json <<EOF
{
  "name": "@d2lang/d2",
  "version": "$version",
  "license": "MPL-2.0",
  "type": "module",
  "main": "index.js",
  "types": "index.d.ts",
  "homepage": "https://github.com/d2lang/d2/tree/$revision/d2js/js"
}
EOF
archive=$(npm pack --silent)
mv "$archive" "$vendor/d2-browser-$short.tgz"
