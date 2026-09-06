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

export interface VerifyEmailProps {
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

export function VerifyEmail({ url }: VerifyEmailProps) {
  return (
    <Html>
      <Head />
      {/* The inbox line under the subject. Without it clients scrape the first text
          they find, which is usually the heading repeated. */}
      <Preview>Confirm your cc4-test email address</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading>Confirm your email</Heading>
          <Text>Click the button to confirm this address for cc4-test.</Text>
          <Button href={url} style={button}>
            Confirm email
          </Button>
          {/* The bare URL is not decoration: a client that blocks the button leaves
              the recipient with no way through, and the text alternative needs it. */}
          <Text style={muted}>Or paste this into your browser: {url}</Text>
        </Container>
      </Body>
    </Html>
  );
}

// `email dev` renders the default export, with PreviewProps as its sample data.
VerifyEmail.PreviewProps = {
  url: "https://cc4-test.example/api/auth/verify-email?token=preview",
} satisfies VerifyEmailProps;

export default VerifyEmail;
