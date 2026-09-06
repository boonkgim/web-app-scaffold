import { expect, test } from "vitest";
import { formatUtc } from "./formatUtc";

test("renders an ISO instant as a UTC wall clock", () => {
  expect(formatUtc("2026-08-09T07:53:46.125Z")).toBe("2026-08-09 07:53:46Z");
});

// The reason the Z is in the output. A reader east of Greenwich seeing "07:53:46" with
// no zone reads their own clock and concludes the webhook landed hours ago.
test("keeps the instant in UTC rather than the running machine's zone", () => {
  expect(formatUtc("2026-08-09T23:30:00.000+08:00")).toBe(
    "2026-08-09 15:30:00Z",
  );
});

test("a value that is not a date is returned untouched, never Invalid Date", () => {
  expect(formatUtc("not a timestamp")).toBe("not a timestamp");
  expect(formatUtc("")).toBe("");
});
