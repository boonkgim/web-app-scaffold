import { expect, test, vi } from "vitest";
import { createMailer, type MailEnv } from "./mailer";

const mocks = vi.hoisted(() => ({
  keys: [] as string[],
  send: vi.fn(async (_payload: unknown) => ({
    data: { id: "1" },
    error: null,
  })),
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
    constructor(key: string) {
      mocks.keys.push(key);
    }
  },
}));

const message = {
  to: "someone@example.test",
  subject: "s",
  html: "<p>h</p>",
  text: "h",
};
const env = (over: Partial<MailEnv>): MailEnv =>
  ({ MAIL_FROM: "web-app-scaffold <no-reply@example.test>", ...over }) as MailEnv;

test("the resend transport posts the rendered message and the configured from", async () => {
  await createMailer(
    env({ MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_test" }),
  ).send(message);

  expect(mocks.keys).toContain("re_test");
  expect(mocks.send).toHaveBeenCalledWith({
    from: "web-app-scaffold <no-reply@example.test>",
    to: ["someone@example.test"],
    subject: "s",
    html: "<p>h</p>",
    text: "h",
  });
});

// The SDK reports failure in the return value, not by throwing.
test("a refusal from Resend becomes an error", async () => {
  mocks.send.mockResolvedValueOnce({
    data: null,
    error: { message: "domain not verified" },
  } as never);

  await expect(
    createMailer(
      env({ MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_test" }),
    ).send(message),
  ).rejects.toThrow("domain not verified");
});

test("the log transport touches no network", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  await createMailer(env({ MAIL_TRANSPORT: "log" })).send(message);

  expect(fetchMock).not.toHaveBeenCalled();
});

// The local gate and the integration tests both read the link off this line. Without
// it they fail as "no link in the mail log", which reads like a mail bug and is not one.
test("the log transport prints the link out of the text body", async () => {
  const logged = vi.spyOn(console, "log").mockImplementation(() => {});

  await createMailer(env({ MAIL_TRANSPORT: "log" })).send({
    ...message,
    text: "Sign in: https://example.test/api/auth/magic-link/verify?token=t",
  });

  expect(String(logged.mock.calls[0][0])).toContain(
    "url=https://example.test/api/auth/magic-link/verify?token=t",
  );
  logged.mockRestore();
});

// The whole point of naming the transport: neither of these may fall back to logging.
test("an unset or unknown transport throws rather than degrading", () => {
  expect(() => createMailer(env({}))).toThrow("MAIL_TRANSPORT");
  expect(() => createMailer(env({ MAIL_TRANSPORT: "smtp" }))).toThrow("smtp");
  expect(() => createMailer(env({ MAIL_TRANSPORT: "resend" }))).toThrow(
    "RESEND_API_KEY",
  );
});
