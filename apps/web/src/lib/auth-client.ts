"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

// No baseURL: the default is the page's origin, which is the whole design. Naming the
// API Worker would set the cookie on an origin the app is not served from, and fail
// silently in production only.
//
// The plugin list has to mirror the server's. The client builds its methods from the
// plugins it is handed, so leaving this one out does not fail to compile — it makes
// `authClient.signIn.magicLink` undefined, which surfaces as a TypeError in the browser.
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
