# Driving the browser for `setup-development` and `setup-production`

`setup-development` and `setup-production` run the browser as their **default surface**, not as a fallback. Every step a
person would otherwise do in a tab — signing up, signing in, approving an OAuth consent
screen, copying a key off a dashboard — is driven with the `mcp__claude-in-chrome` tools.

What stays on the CLI is narrow and deliberate: the **verified creates** in
`services.md`. `neonctl projects create`, `wrangler hyperdrive create`,
`stripe webhook_endpoints create` and `wrangler secret put` were checked live against real
accounts, and a verified command beats clicking through a console that redesigns itself.
The split is therefore:

| Kind of step                                              | Surface                  |
| --------------------------------------------------------- | ------------------------ |
| Signup, login, OAuth consent, MFA                         | **Browser**              |
| Reading a key, an id, a connection string off a dashboard | **Browser**              |
| Anything with no API at all (the Resend key)              | **Browser**              |
| Creating a resource with a verified command               | CLI (`services.md`)      |
| `stripe listen`, `pnpm`, `docker`, `git`                  | CLI                      |
| Anything where the CLI flag is **not** in `services.md`   | **Browser**, and say why |

## Before the first navigate

1. **`tabs_context_mcp` first, always.** It reports which tabs exist and which sites are
   permitted. Acting before it is how you end up typing into someone's unrelated tab.
2. **The extension is permissioned per site, by the user, and you cannot grant it.** If a
   vendor's domain is not permitted, the call fails and the fix is the user clicking
   allow in the extension. Ask for the domains up front, in one go, rather than hitting
   the wall four times:
   `dashboard.stripe.com`, `resend.com`, `console.neon.tech`, `dash.cloudflare.com`,
   `github.com`.
3. **Open a new tab** with `tabs_create_mcp`. Never navigate a tab the user is using.

## The loop, per page

`read_page` → decide → act → `read_page` again to confirm the page actually changed.

- **`read_page` before every action.** It returns text and element references; a click
  aimed at a remembered layout is a click at whatever moved into that spot.
- **`find` to locate a control by its label** rather than scanning a long page.
- **`computer`** for clicking and typing that reading cannot do.
- **`form_input`** for filling fields; it is more reliable than synthesising keystrokes.
- **Never trigger `alert`/`confirm`/`prompt` or any modal dialog.** A blocked dialog
  freezes the extension and the user has to dismiss it by hand. Avoid buttons that
  obviously confirm a destructive action.
- **Do not loop.** Two or three failed attempts on the same page is the signal to stop,
  say what you tried, and hand the page to the user.

## Secrets: three ways in, and the one to prefer

There are three ways a key gets from a dashboard into a file, and they differ in who sees
it. **Prefer the first.**

### 1. The clipboard relay — the default

Click the page's own **Copy** button with `computer`, then pipe the clipboard into the
destination. The value goes browser → clipboard → file and **never enters the model's
context**:

```bash
{ printf 'RESEND_API_KEY='; bash .claude/skills/setup-development/scripts/clipboard.sh --paste --expect re_; printf '\n'; } \
  >> apps/graphql/.env.development
```

```bash
bash .claude/skills/setup-development/scripts/clipboard.sh --paste --expect whsec_ | npx wrangler@4 secret put STRIPE_WEBHOOK_SECRET
```

`clipboard.sh` detects the backend per OS (`pbpaste` on macOS, `wl-paste` or `xclip` on
Linux, `powershell.exe Get-Clipboard` on Windows and WSL) and guards the two ways a copy
silently fails:

- `--expect <prefix>` fails (exit 2) when the clipboard does not start with what it
  should, which is what a **stale clipboard** looks like when the copy button did not
  fire. Always pass it: `re_`, `sk_test_`, `pk_test_`, `whsec_`, `postgres://`.
- Whitespace inside the value fails (exit 3), which is what copying a **label or a whole
  table row** looks like.
- An empty clipboard fails (exit 1).

Then confirm without disclosing: `clipboard.sh --shape` prints `36 chars, starts re_a` and
never the value. Then `clipboard.sh --clear`, so the secret is not left on a clipboard the
user will paste somewhere else.

**When the relay is unavailable**, say so and fall back. It needs the browser and the
shell on the same machine: an ssh session, a remote container or a web session has no
route to the local clipboard, and `--check` reports that rather than pasting whatever
happens to be there. `preflight.sh` shows this as a row.

### 2. `read_page` — when there is no relay

`read_page` returns the key as text, which means **the model has seen it**. That is not a
disaster and it is not nothing: it is in the context window, and the context window ends
up in logs. Use it when the relay is unavailable and the user has agreed to it.

### 3. The user pastes it — when they prefer that

Navigate to the page, confirm what is on screen, and stop. They paste into the file
themselves. Slower, and you cannot verify the page matched, but nothing crosses.

### Rules for all three

- **Never write a key into a reply, a summary, a commit message, or a filename.** It goes
  into the destination file and nowhere else.
- **Never echo it.** If you must write one by hand rather than through the relay, use a
  quoted heredoc so the value is neither echoed nor expanded:

  ```bash
  cat >> apps/graphql/.env.development <<'EOF'
  RESEND_API_KEY=re_...
  EOF
  ```

  For a production secret, pipe into `wrangler secret put`, which reads stdin.

- **Confirm by shape, never by value.** "`RESEND_API_KEY` set, 36 chars, starts `re_`" is
  a useful confirmation; the key itself is not.
- **The destination must be gitignored.** All three `.env.development` files are. Check
  before writing if you are ever unsure: `git check-ignore -v <path>`.
- **Reveal-once keys.** Stripe's webhook signing secret and Resend's key are shown once.
  Copy and write in the same step; a second look after the modal closes gets nothing.
- **Clear the clipboard** once the value has landed.

## Per-vendor

These name the page and what to look for on it. They are **not** verified selectors and
the consoles change — `read_page` and reconcile what is actually there against what is
written here. If the page does not match, say so rather than clicking hopefully.

### Cloudflare

- **Login:** `wrangler login` opens the consent page itself. Drive the approve button,
  then let the CLI finish; `wrangler whoami` is the confirmation, not the page.
- **Account id:** `https://dash.cloudflare.com` → the account's Workers page URL contains
  it, and the overview sidebar lists it. `wrangler whoami` also prints it, and is the
  cheaper read when it works.
- Creating Workers and Hyperdrive stays on the CLI.

### Neon

- **Signup / login:** `https://console.neon.tech`. GitHub OAuth is the fewest steps if the
  user already has `gh` working.
- **`neonctl auth` opens a consent page** naming the org — read it aloud to the user
  before approving. That page _is_ the account gate for Neon.
- **Connection string, if the CLI path fails:** project → Connection Details → the
  **direct** string, which has its own copy button. Neon's default toggle is _pooled_; the
  direct one is what migrations need. Relay it with `--expect postgres://`. Getting this wrong produces a migration that fails on session-level work, not a
  connection error.

### Stripe

- **Test API keys:** `https://dashboard.stripe.com/test/apikeys`. Confirm the page says
  **Test mode** before reading anything. Both rows have a copy control; the secret key
  needs a reveal click first. Relay each one separately — `--expect pk_test_`, then
  `--expect sk_test_` — rather than copying both and sorting them out afterwards.
- **A `sk_live_` or a page in live mode is a hard stop, outside `setup-production`'s explicit
  "Stripe, live mode" section.** Do not read it, do not write it, say so and ask. Inside
  that section, a page reading **Live mode** is exactly the page to be on — confirm it the
  same way you confirm Test mode here, then proceed.
- **Account picker:** the dashboard is per-account and the switcher is top-left. The
  account shown here must be the same one the CLI's `--project-name` resolves to;
  confirm both, because a mismatch produces keys that work and a webhook that never fires.
- Webhook endpoint creation stays on the CLI (`stripe webhook_endpoints create`) in test
  mode, because the `whsec_` in its response is easier to capture than a modal's
  reveal-once field. **In live mode, do this in the dashboard instead** —
  `https://dashboard.stripe.com/webhooks` — because no live-mode flag for that command is
  verified; see `setup-production`'s "Stripe, live mode" section.

### Resend

- **The key page:** `https://resend.com/api-keys` → Create API Key. **Resend has no API
  for creating keys** — this step is browser-only, there is no CLI fallback to prefer.
- Name the key for the project so the user can find it later.
- The value is shown **once**, with a copy button next to it. Relay it with `--expect re_`
  in the same step; if the modal closes first, the key is gone and the user makes another.
- `onboarding@resend.dev` is the shared sender: no domain verification, but it **only
  delivers to the Resend account owner's own address**. That is why `MAIL_TEST_RECIPIENTS`
  should normally be that address.

### GitHub

- `gh auth login` is the better path when `gh` is installed. Drive the browser only for
  the device-code approval page, or for signup.

## What is the user's own to do

Drive them to the page, say what to click, and wait:

- **Signup forms.** Do not fill in a signup on someone's behalf.
- **Payment details**, on any vendor, ever.
- **Email verification** and any MFA prompt.
- **Accepting terms.**

These are consent, not data entry. Reading them aloud and clicking through is the one
place where being helpful and being wrong look identical from the transcript.
