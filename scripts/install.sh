#!/usr/bin/env sh
# EngCode installer for macOS and Linux.
#
# Published release:
#   curl -fsSL https://engcode.example/install.sh | sh
#
# From a checkout or a release folder:
#   sh scripts/install.sh --from .
#   sh scripts/install.sh --from ./release/engcode-0.1.0.tgz
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
engcode --version
echo
echo "EngCode is ready."
echo "Try:"
echo "  engcode learn"
echo "  engcode new my-project --type script"
echo "  engcode run my-project/main.eng"
