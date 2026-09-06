/** Render an ISO 8601 instant as a UTC wall clock, with the zone said out loud.
 *
 *  UTC and not the visitor's zone, for the reason the UI rules give: this renders in a
 *  server component, and the visitor's offset is a value that only exists after mount.
 *  The trailing Z is not decoration — without it the string reads as local time and is
 *  wrong by however far the reader sits from Greenwich.
 *
 *  An unparseable value comes back untouched rather than as "Invalid Date". The field is
 *  a String in the SDL, so this is the one place that assumption is checked, and a
 *  diagnostic panel showing a strange timestamp is better than one showing nothing.
 */
export function formatUtc(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return `${at.toISOString().slice(0, 19).replace("T", " ")}Z`;
}
