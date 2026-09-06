// Components and `render` both come from `react-email`. Since v6 that is the whole
// library — @react-email/components and the per-component packages are deprecated.
import { render } from "react-email";
import { SignInEmail } from "../emails/sign-in-email";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// Two passes, because `render` returns one format per call. The text alternative is
// not optional politeness: a message without one is scored as spam by most filters,
// and a client with images and HTML off shows an empty body.
export async function renderSignInEmail(url: string): Promise<RenderedEmail> {
  const element = <SignInEmail url={url} />;

  return {
    // The subject lives here rather than in the template: a React component renders a
    // body, and a subject is a header. Keeping them in one function is what stops a
    // template being sent with someone else's subject.
    subject: "Your cc4-test sign-in link",
    html: await render(element),
    text: await render(element, { plainText: true }),
  };
}
