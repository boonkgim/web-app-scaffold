import { Resend } from "resend";

/** What a mailer needs from the environment.
 *
 *  Declared structurally rather than importing the Worker's Env: this package must not
 *  know it is used from a Worker, and a generated interface satisfies this one by shape.
 */
export interface MailEnv {
  MAIL_TRANSPORT: string;
  MAIL_FROM: string;
  RESEND_API_KEY?: string;
}

export interface Message {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(message: Message): Promise<void>;
}

/** Pick a transport by name. Unknown or unset throws.
 *
 *  Explicit rather than inferred from NODE_ENV or from whether a key happens to be
 *  present: both of those fail *open* in the wrong direction — a production deploy that
 *  lost its key would quietly degrade to logging and report every send as a success.
 */
export function createMailer(env: MailEnv): Mailer {
  switch (env.MAIL_TRANSPORT) {
    case "resend": {
      const key = env.RESEND_API_KEY;
      if (!key) throw new Error("MAIL_TRANSPORT=resend needs RESEND_API_KEY");
      const resend = new Resend(key);

      return {
        async send(message) {
          // The SDK returns { data, error } and does not throw, so a send that failed
          // looks exactly like one that worked unless this is checked.
          const { error } = await resend.emails.send({
            from: env.MAIL_FROM,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
          });
          if (error)
            throw new Error(`Resend refused the message: ${error.message}`);
        },
      };
    }

    case "log":
      return {
        async send(message) {
          console.log(`[mail:log] to=${message.to} subject=${message.subject}`);
        },
      };

    default:
      throw new Error(
        `Unknown MAIL_TRANSPORT ${JSON.stringify(env.MAIL_TRANSPORT)} — expected "resend" or "log"`,
      );
  }
}
