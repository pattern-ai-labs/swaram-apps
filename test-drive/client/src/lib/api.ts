/** Mint a short-lived swaram ephemeral token via our backend. */
export async function getSwaramToken(
  body?: Record<string, unknown>
): Promise<{ token: string }> {
  const r = await fetch("/api/swaram-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) throw new Error(j.error || "Could not start the voice session.");
  return { token: j.token as string };
}
