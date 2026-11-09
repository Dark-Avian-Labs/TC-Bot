#!/usr/bin/env bash
set -euo pipefail

: "${TS_AUTHKEY:?TS_AUTHKEY secret is not set}"
: "${FORGEJO_HOST:?FORGEJO_HOST is not set}"
STATE_DIR="${HOME}/.tailscale"
SOCKS=localhost:1055

mkdir -p "$STATE_DIR"

if ! pgrep -x tailscaled >/dev/null; then
  rm -f "$STATE_DIR/tailscaled.sock"
  sudo -E nohup tailscaled \
    --tun=userspace-networking \
    --socks5-server="$SOCKS" \
    --outbound-http-proxy-listen=localhost:1056 \
    --state=mem: \
    --socket="$STATE_DIR/tailscaled.sock" \
    >"$STATE_DIR/tailscaled.log" 2>&1 &
  for _ in $(seq 1 20); do [ -S "$STATE_DIR/tailscaled.sock" ] && break; sleep 0.5; done
fi

if [ ! -S "$STATE_DIR/tailscaled.sock" ]; then
  echo "tailscaled socket did not appear" >&2
  exit 1
fi

TS="sudo tailscale --socket=$STATE_DIR/tailscaled.sock"

if ! $TS status >/dev/null 2>&1; then
  $TS up --auth-key="$TS_AUTHKEY" --hostname="cursor-agent-$(hostname | cut -c1-8)" --accept-dns=false
fi

git config --global --unset-all http.proxy || true
git config --global "http.https://${FORGEJO_HOST}.proxy" "socks5h://$SOCKS"
git config --global --unset-all core.sshCommand || true
ssh_config="${HOME}/.ssh/config"
mkdir -p "${HOME}/.ssh"
chmod 700 "${HOME}/.ssh"
marker="# darkavianlabs-forgejo-tailscale"
if ! grep -qF "$marker" "$ssh_config" 2>/dev/null; then
  cat >> "$ssh_config" <<EOF
$marker
Host ${FORGEJO_HOST}
  Port 2223
  ProxyCommand nc -X 5 -x $SOCKS %h %p
EOF
  chmod 600 "$ssh_config"
fi

cat > "$STATE_DIR/proxy.env" <<ENV
export ALL_PROXY=socks5h://$SOCKS
export NO_PROXY=localhost,127.0.0.1
ENV

if curl -fsS --max-time 10 --socks5-hostname "$SOCKS" "https://$FORGEJO_HOST/api/v1/version" >/dev/null 2>&1 \
 || curl -fsS --max-time 10 --socks5-hostname "$SOCKS" "http://$FORGEJO_HOST/api/v1/version" >/dev/null 2>&1; then
  echo "Tailscale up, Forgejo reachable at $FORGEJO_HOST"
else
  echo "Tailscale up, but Forgejo check at $FORGEJO_HOST failed (check ACL / FORGEJO_HOST)" >&2
fi
