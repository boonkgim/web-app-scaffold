import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "react-email";

export interface SignInEmailProps {
  url: string;
}

// Inline styles only. Email clients strip or ignore <style> blocks unpredictably, and
// there is no cascade to rely on — this is the one place in the repo where naming a
// colour is correct, because theme.css does not reach a mail client.
const main = { backgroundColor: "#ffffff", fontFamily: "sans-serif" };
const container = { margin: "0 auto", padding: "24px", maxWidth: "480px" };
const button = {
  backgroundColor: "#18181b",
  color: "#ffffff",
  borderRadius: "6px",
  padding: "10px 16px",
  fontSize: "14px",
  textDecoration: "none",
  display: "inline-block",
};
const muted = { color: "#71717a", fontSize: "12px" };

export function SignInEmail({ url }: SignInEmailProps) {
  return (
    <Html>
      <Head />
      {/* The inbox line under the subject. Without it clients scrape the first text
          they find, which is usually the heading repeated. */}
      <Preview>Your cc4-test sign-in link</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading>Sign in to cc4-test</Heading>
          {/* No expiry in minutes and no "single use" promise with a number attached:
              both live in the magicLink plugin's options, and a second copy here goes
              stale the moment someone tunes them. */}
          <Text>Click the button to sign in. The link works once.</Text>
          <Button href={url} style={button}>
            Sign in
          </Button>
          {/* The bare URL is not decoration: a client that blocks the button leaves
              the recipient with no way through, and the text alternative needs it. */}
          <Text style={muted}>Or paste this into your browser: {url}</Text>
          {/* This mail is a credential, which the confirm-your-address one it replaced
              was not. Anyone can put an address into the form, so the recipient who did
              not ask needs the sentence that says ignoring it is the whole remedy. */}
          <Text style={muted}>
            If you did not request this, ignore this email. Nobody can sign in
            without the link above.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// `email dev` renders the default export, with PreviewProps as its sample data.
SignInEmail.PreviewProps = {
  url: "https://cc4-test.example/api/auth/magic-link/verify?token=preview",
} satisfies SignInEmailProps;

export default SignInEmail;
