#!/usr/bin/env bash
# Read the system clipboard, so a secret can go from a vendor's "Copy" button straight
# into a file without passing through the model's context.
#
# This is the point of the script. `read_page` returns a key as text, which means the
# model has seen it; a click on the page's own copy button followed by
#
#   { printf 'RESEND_API_KEY='; bash clipboard.sh --paste --expect re_; } >> .env.development
#
# moves the value from the browser to the file with nobody reading it. Use --shape to
# confirm afterwards: it prints a length and a prefix and never the value.
#
# Backends, in detection order — the flow has to work on macOS, Windows and Linux:
#
#   pbpaste                         macOS
#   wl-paste                        Linux/Wayland
#   xclip, xsel                     Linux/X11
#   powershell.exe Get-Clipboard    Windows (Git Bash, MSYS) and WSL
#
# The clipboard is shared, user-visible state, and it does not cross machines: if the
# browser runs somewhere the shell does not (ssh, a remote container, a web session),
# --check reports unavailable and the caller must fall back rather than paste whatever
# happens to be in the local clipboard.
#
# Usage:
#   clipboard.sh --check                    is a relay possible here? prints the backend
#   clipboard.sh --paste [--expect PREFIX]  the value, raw, no trailing newline
#   clipboard.sh --shape [--expect PREFIX]  "42 chars, starts sk_test_" — never the value
#   clipboard.sh --clear                    overwrite the clipboard, after a secret is used
#
# Exit: 0 ok · 1 no backend or empty clipboard · 2 prefix mismatch · 3 not a single token
#       · 64 usage

set -uo pipefail

mode=""
expect=""
while [ $# -gt 0 ]; do
  case "$1" in
    --check|--paste|--shape|--clear) mode="${1#--}"; shift ;;
    --expect) expect="${2:-}"; shift 2 ;;
    --expect=*) expect="${1#--expect=}"; shift ;;
    -h|--help) sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; exit 64 ;;
  esac
done
[ -n "$mode" ] || { printf 'want one of --check --paste --shape --clear\n' >&2; exit 64; }

# --- backend detection -----------------------------------------------------
# Wayland and X11 both need their display variable: the binary being on PATH proves
# nothing when the shell has no session to talk to (a bare ssh, a container).
backend=""
reason=""
if command -v pbpaste >/dev/null 2>&1; then
  backend=pbpaste
elif command -v wl-paste >/dev/null 2>&1 && [ -n "${WAYLAND_DISPLAY:-}" ]; then
  backend=wl-paste
elif command -v xclip >/dev/null 2>&1 && [ -n "${DISPLAY:-}" ]; then
  backend=xclip
elif command -v xsel >/dev/null 2>&1 && [ -n "${DISPLAY:-}" ]; then
  backend=xsel
elif command -v powershell.exe >/dev/null 2>&1; then
  backend=powershell
else
  if [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && [ "$(uname -s)" = Linux ]; then
    reason="no DISPLAY or WAYLAND_DISPLAY — this shell has no graphical session, so it cannot reach the browser's clipboard"
  else
    reason="no clipboard tool found — install one: xclip (X11), wl-clipboard (Wayland)"
  fi
fi

read_clipboard() {
  case "$backend" in
    pbpaste)    pbpaste ;;
    wl-paste)   wl-paste --no-newline ;;
    xclip)      xclip -selection clipboard -o ;;
    xsel)       xsel --clipboard --output ;;
    # -Raw keeps a multi-line value in one piece; the CRLF it emits is stripped below.
    powershell) powershell.exe -NoProfile -NonInteractive -Command Get-Clipboard -Raw ;;
  esac 2>/dev/null
}

write_clipboard() {  # stdin -> clipboard
  case "$backend" in
    pbpaste)    pbcopy ;;
    wl-paste)   wl-copy ;;
    xclip)      xclip -selection clipboard ;;
    xsel)       xsel --clipboard --input ;;
    powershell) powershell.exe -NoProfile -NonInteractive -Command 'Set-Clipboard -Value ""' >/dev/null ;;
  esac 2>/dev/null
}

if [ "$mode" = check ]; then
  if [ -n "$backend" ]; then printf 'ok %s\n' "$backend"; exit 0; fi
  printf 'unavailable — %s\n' "$reason"; exit 1
fi

[ -n "$backend" ] || { printf 'clipboard unavailable — %s\n' "$reason" >&2; exit 1; }

if [ "$mode" = clear ]; then
  printf '' | write_clipboard
  printf 'clipboard cleared\n'
  exit 0
fi

# --- read and normalise ----------------------------------------------------
# Strip CR (Windows), then leading/trailing whitespace. Everything this script is for is
# an opaque token, so whitespace *inside* the value means the copy grabbed a label, a
# whole table row, or the page's placeholder text — a mistake worth failing on rather
# than writing a broken key into an env file that fails much later.
value="$(read_clipboard | tr -d '\r')"
value="${value#"${value%%[![:space:]]*}"}"
value="${value%"${value##*[![:space:]]}"}"

if [ -z "$value" ]; then
  printf 'clipboard is empty — the copy button probably did not fire\n' >&2
  exit 1
fi
case "$value" in
  *[[:space:]]*)
    printf 'clipboard holds whitespace inside the value (%d chars) — that is a copied label or row, not a key\n' "${#value}" >&2
    exit 3 ;;
esac

# A prefix guard is what catches the other half of a failed copy: the button did not
# fire and the clipboard still holds whatever the user copied before. Without it, a
# stale clipboard is written into the env file and fails hours later.
if [ -n "$expect" ]; then
  case "$value" in
    "$expect"*) ;;
    *) printf 'clipboard does not start with %s (%d chars) — stale clipboard, or the wrong field was copied\n' "$expect" "${#value}" >&2
       exit 2 ;;
  esac
fi

if [ "$mode" = shape ]; then
  # Never the value. Enough prefix to tell sk_test_ from sk_live_ and no more — capped at
  # a third of the length as well as at 8, so confirming a short token does not disclose
  # most of it.
  n=8
  third=$(( ${#value} / 3 ))
  [ "$third" -lt "$n" ] && n="$third"
  [ "$n" -lt 1 ] && n=1
  printf '%d chars, starts %s\n' "${#value}" "$(printf '%s' "$value" | cut -c1-"$n")"
  exit 0
fi

printf '%s' "$value"   # --paste: no trailing newline, so the caller controls the line
exit 0
