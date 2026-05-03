export async function apiFetch(
  input: RequestInfo,
  init?: RequestInit & { signal?: AbortSignal },
  timeoutMs = 30000,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const signal = init?.signal || controller.signal;
    const res = await fetch(input, {
      credentials: "include",
      ...init,
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });

    if (res.status === 401) {
      throw new Error("Unauthorized");
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || "API Error");
    }

    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}
