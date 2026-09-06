"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Where a message belongs, not just what it says. `form` is the slot for failures that
 *  are about the attempt rather than about the field.
 */
type Errors = { email?: string; form?: string };

/** Better Auth reports failures as codes; the strings are ours.
 *
 *  The raw `message` is a server-side zod report on the request body — "[body.email]
 *  Invalid email address" — written for whoever is reading the 400, not for the person
 *  typing. Anything unmapped falls through to a plain sentence and gets logged, so an
 *  unfamiliar code degrades to vague rather than to API wire text.
 *
 *  Short, and not only because there is one field. A magic link request must answer
 *  identically whether or not the address has an account: a distinguishable "no such
 *  user" turns this form into a way to ask who has signed up here. That is why there is
 *  no USER_NOT_FOUND row — not an oversight.
 */
const SERVER_ERRORS: Record<string, Errors> = {
  INVALID_EMAIL: { email: "Enter a valid email address." },
  // The one thing standing between this form and using it to mail strangers. Worth a
  // real message rather than the generic fallback, because it is the failure a person
  // is most likely to hit honestly, by clicking twice.
  TOO_MANY_REQUESTS: { form: "Too many attempts. Wait a minute." },
};

export function AuthPanel() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  // The page reads `viewer` in a server component, which a client-side sign-out leaves
  // stale. refresh() is what asks for the re-render — and the visible proof that the
  // cookie reached the API through the proxy, not merely the browser.
  const done = () => {
    setErrors({});
    router.refresh();
  };

  if (isPending) return <p className="text-muted-foreground text-sm">…</p>;

  if (session) {
    return (
      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-sm">{session.user.email}</span>
        <Button
          variant="outline"
          onClick={() => authClient.signOut().then(done)}
        >
          Sign out
        </Button>
      </div>
    );
  }

  // One branch, not two. There is no sign-up: an address Better Auth has not seen gets
  // a row when the link is followed, so the form cannot know — and must not say —
  // whether this is a first visit.
  const submit = async () => {
    // A blank or malformed address is answerable here. Sending it costs a round trip to
    // be told what the browser already knew, and comes back phrased as a validation dump.
    if (!email.trim()) return setErrors({ email: "Enter your email address." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return setErrors({ email: "Enter a valid email address." });

    setErrors({});
    setBusy(true);
    // A path, never an absolute URL. Better Auth resolves callbackURL against baseURL;
    // passing one straight through from the browser would make the mailed link an open
    // redirect that arrives with a fresh session attached.
    const { error: failed } = await authClient.signIn.magicLink({
      email,
      callbackURL: "/",
    });
    setBusy(false);

    if (failed) {
      const known = failed.code ? SERVER_ERRORS[failed.code] : undefined;
      if (!known) console.error("Unmapped auth error", failed);
      return setErrors(known ?? { form: "Something went wrong. Try again." });
    }
    setSent(true);
  };

  // The message slot below is rendered whether or not it has anything to say, holding
  // its line open with `min-h-[1lh]` — one line box, so the gap tracks the font instead
  // of a pixel constant. The card is centred, so a slot that appears out of nowhere
  // resizes the panel and moves the button the visitor is already reaching for. Neither
  // Base UI's Field nor shadcn's reserves this space; it has to be done here.
  //
  // The slot is wrapped with its control rather than sitting beside it in the gap flow.
  // A reserved line that is a grid item costs its own height *plus* the container's gap,
  // on an empty form, forever — so the slot pairs with the input at zero gap and the
  // reserve costs exactly the one line it is holding.
  return (
    <div className="grid gap-3">
      {/* Form-level messages lead the form, which is where every design system that has
          researched this puts them — GOV.UK, NHS and Scottish Government all place the
          summary above the fields. It is also the exception to the reserve-the-space rule
          below: an alert is a block, not a line, so there is no single height to hold, and
          holding one would pad the form permanently for something most submits never show. */}
      {errors.form ? (
        <Alert variant="destructive">
          <AlertTitle>{errors.form}</AlertTitle>
        </Alert>
      ) : null}
      {/* role overrides the component's built-in `alert`: a confirmation is not urgent, and
          a polite live region does not interrupt what a screen reader is already saying.
          The wording names no address and admits no account — see SERVER_ERRORS. */}
      {sent ? (
        <Alert role="status">
          <AlertTitle>Check your inbox for a sign-in link.</AlertTitle>
        </Alert>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <div>
          <Input
            id="email"
            type="email"
            value={email}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              // The message described the old value; keeping it would leave the field red
              // while the visitor fixes exactly what it complained about. The notice goes
              // with it — it refers to an address no longer in the field, and leaving it
              // up would have someone waiting on mail sent somewhere else.
              setErrors({});
              setSent(false);
            }}
          />
          <p
            id="email-error"
            role="alert"
            className="text-destructive min-h-[1lh] text-sm"
          >
            {errors.email}
          </p>
        </div>
      </div>
      {/* Disabled while in flight, and the label says so. A second click mails a second
          link, and two links in an inbox is how someone ends up clicking the older one.
          Whether the first is then still valid is the plugin's business, not a guess to
          bake into the UI — not offering the second click sidesteps the question. */}
      <Button onClick={submit} disabled={busy}>
        {busy ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </div>
  );
}
