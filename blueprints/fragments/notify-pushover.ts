/**
 * Fragment: notificar al alumno via Pushover.
 *
 * Defaults probados con iphone:
 *   priority=1  (high, bypass DND)
 *   sound=magic (reliable en iOS)
 *
 * El alumno DEBE haber seguido el skill `pushover-notifications` antes.
 */

export type NotifyResult = { sent: boolean; error?: string };

export async function notifyPushover(opts: {
  userKey: string;
  appToken: string;
  title: string;
  message: string;       // max 1024 chars
  url?: string;          // botón "Ver"
  urlTitle?: string;
  priority?: -2 | -1 | 0 | 1 | 2;
  sound?: string;
}): Promise<NotifyResult> {
  const {
    userKey,
    appToken,
    title,
    message,
    url,
    urlTitle,
    priority = 1,
    sound = "magic",
  } = opts;

  if (!userKey || !appToken) {
    return { sent: false, error: "Pushover config incompleta — skip" };
  }

  const params = new URLSearchParams({
    token: appToken,
    user: userKey,
    title: title.slice(0, 250),
    message: message.slice(0, 1024),
    priority: String(priority),
    sound,
  });

  if (url) {
    params.set("url", url);
    if (urlTitle) params.set("url_title", urlTitle.slice(0, 100));
  }

  if (priority === 2) {
    params.set("retry", "60");
    params.set("expire", "1800");
  }

  try {
    const resp = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { sent: false, error: `Pushover ${resp.status}: ${errText.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
