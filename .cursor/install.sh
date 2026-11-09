#!/usr/bin/env bash
set -euo pipefail

node_spec="$(sed -n 's/^[[:space:]]*"node"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -n 1)"
if [ -z "$node_spec" ]; then
  echo "package.json has no engines.node" >&2
  exit 1
fi

case "$node_spec" in
  [0-9]*.[0-9]*.[0-9]*)
    NODE_VERSION="$node_spec"
    ;;
  *)
    major="$(printf '%s\n' "$node_spec" | sed -n 's/[^0-9]*\([0-9][0-9]*\).*/\1/p')"
    if [ -z "$major" ]; then
      echo "cannot read a node major from engines.node ($node_spec)" >&2
      exit 1
    fi
    NODE_VERSION="$(curl -fsSL "https://nodejs.org/dist/latest-v${major}.x/SHASUMS256.txt" | sed -n 's/.*node-v\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)-linux-x64\.tar\.xz.*/\1/p' | head -n 1)"
    if [ -z "$NODE_VERSION" ]; then
      echo "could not resolve the current node ${major} release" >&2
      exit 1
    fi
    ;;
esac

if ! /usr/local/bin/node -v 2>/dev/null | grep -qx "v${NODE_VERSION}"; then
  tmp="$(mktemp)"
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o "$tmp"
  sudo tar -xJf "$tmp" -C /usr/local --strip-components=1 --no-same-owner
  rm -f "$tmp"
fi

export PATH="/usr/local/bin:${PATH}"
hash -r

PNPM_VERSION="$(node -p 'require("./package.json").packageManager.replace(/^pnpm@/, "")')"
sudo npm install -g --allow-scripts=pnpm "pnpm@${PNPM_VERSION}"

for cmd in node npm npx corepack pnpm pnpx; do
  if [ -e "/usr/local/bin/${cmd}" ]; then
    ln -sfn "/usr/local/bin/${cmd}" "/usr/local/cargo/bin/${cmd}"
  fi
done

bashrc_line='export PATH="/usr/local/bin:$PATH"'
if ! grep -qxF "$bashrc_line" "${HOME}/.bashrc"; then
  tmp="$(mktemp)"
  printf '%s\n' "$bashrc_line" | cat - "${HOME}/.bashrc" > "$tmp"
  mv "$tmp" "${HOME}/.bashrc"
fi

if ! command -v tailscaled >/dev/null; then
  . /etc/os-release
  curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/${VERSION_CODENAME}.noarmor.gpg" | sudo tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
  curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/${VERSION_CODENAME}.tailscale-keyring.list" | sudo tee /etc/apt/sources.list.d/tailscale.list >/dev/null
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y tailscale
fi

if ! command -v nc >/dev/null; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y netcat-openbsd
fi

pnpm install --frozen-lockfile
