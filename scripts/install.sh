#!/usr/bin/env sh
# EngCode installer for macOS and Linux.
#
# Published npm package (recommended):
#   npm install -g engcode
#
# From a checkout or a release folder:
#   sh scripts/install.sh --from .
#   sh scripts/install.sh --from ./release/engcode-1.0.0.tgz
set -eu

VERSION=""
FROM=""
PREFIX=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2:-}"; shift 2 ;;
    --from) FROM="${2:-}"; shift 2 ;;
    --prefix) PREFIX="${2:-}"; shift 2 ;;
    -h|--help)
      echo "Usage: install.sh [--version V] [--from PATH] [--prefix DIR]"
      exit 0
      ;;
    *) echo "I don't know the option $1."; exit 1 ;;
  esac
done

cyan() { printf '\033[36m==> %s\033[0m\n' "$1"; }

echo "EngCode - Build with Simple English"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "EngCode needs Node.js 20 or newer."
  echo "Install it from https://nodejs.org/ and run this script again."
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "I found Node.js but not npm. Install npm and try again."
  exit 1
fi

NODE_VERSION="$(node --version | sed 's/^v//')"
NODE_MAJOR="$(printf '%s' "$NODE_VERSION" | cut -d. -f1)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "EngCode needs Node.js 20 or newer. This machine has $NODE_VERSION."
  exit 1
fi

if [ -n "$FROM" ]; then
  if [ -d "$FROM" ]; then
    if [ -f "$FROM/package.json" ]; then
      # A checkout: pack it first so sources, tests, and node_modules are not copied.
      cyan "Packing EngCode from $FROM"
      PACK_DIR="$(mktemp -d)"
      trap 'rm -rf "$PACK_DIR"' EXIT
      if (cd "$FROM" && npm pack --pack-destination "$PACK_DIR") >"$PACK_DIR/pack.log" 2>&1; then
        PACKED="$(grep -E '^engcode-.*\.tgz$' "$PACK_DIR/pack.log" | tail -n 1)"
      else
        cat "$PACK_DIR/pack.log"
        echo "npm pack did not finish. Run 'npm install' in the checkout first."
        exit 1
      fi
      if [ -z "$PACKED" ]; then
        cat "$PACK_DIR/pack.log"
        echo "npm pack did not produce a tarball."
        exit 1
      fi
      FROM="$PACK_DIR/$PACKED"
    else
      # A release folder: use the packed tarball inside it.
      TGZ="$(find "$FROM" -maxdepth 1 -name 'engcode-*.tgz' -type f | sort | tail -n 1)"
      if [ -z "$TGZ" ]; then
        echo "I could not find engcode-*.tgz or package.json in $FROM."
        exit 1
      fi
      FROM="$TGZ"
    fi
  fi
  cyan "Installing EngCode from $FROM"
  if [ -n "$PREFIX" ]; then
    npm install -g --prefix "$PREFIX" "$FROM"
  else
    npm install -g "$FROM"
  fi
elif [ -n "$VERSION" ]; then
  cyan "Installing EngCode $VERSION from npm"
  if [ -n "$PREFIX" ]; then
    npm install -g --prefix "$PREFIX" "engcode@$VERSION"
  else
    npm install -g "engcode@$VERSION"
  fi
else
  cyan "Installing the latest EngCode from npm"
  if [ -n "$PREFIX" ]; then
    npm install -g --prefix "$PREFIX" engcode
  else
    npm install -g engcode
  fi
fi

cyan "Checking the command"
if [ -n "$PREFIX" ]; then
  # Unix npm puts launchers in PREFIX/bin; Windows npm puts them in PREFIX itself.
  if [ -x "$PREFIX/bin/engcode" ]; then
    "$PREFIX/bin/engcode" --version
    LAUNCHER_DIR="$PREFIX/bin"
  elif [ -f "$PREFIX/engcode" ]; then
    sh "$PREFIX/engcode" --version
    LAUNCHER_DIR="$PREFIX"
  else
    echo "The install finished, but no engcode launcher was found under $PREFIX."
    exit 1
  fi
  echo
  echo "Add $LAUNCHER_DIR to your PATH to run 'engcode' anywhere."
else
  if ! command -v engcode >/dev/null 2>&1; then
    echo "The install finished, but 'engcode' is not on PATH yet."
    echo "Open a new terminal, or add npm's global bin folder to PATH."
    exit 1
  fi
  engcode --version
fi
echo
echo "EngCode is ready."
echo "Try:"
echo "  engcode learn"
echo "  engcode new my-project --type script"
echo "  engcode run my-project/main.eng"
