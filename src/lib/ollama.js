// Talk to Ollama's HTTP API on this machine.

export const DEFAULT_URL = "http://localhost:11434";

/** Ollama cannot be reached, answered with an error, or lacks a model. */
export class OllamaError extends Error {}

export async function ollamaCall(url, path, body = null, { timeout = 300000, fetchFn = globalThis.fetch } = {}) {
  const target = url.replace(/\/+$/, "") + path;
  let response;
  try {
    response = await fetchFn(target, {
      method: body === null ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: body === null ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    throw new OllamaError(`unreachable:${url}:${error?.message || error}`);
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new OllamaError(`http:${response.status}:${detail}`);
  }
  return response.json();
}

/** The names of the models Ollama has installed. */
export async function installedModels(url = DEFAULT_URL, options = {}) {
  const data = await ollamaCall(url, "/api/tags", null, { timeout: 10000, ...options });
  return (data.models || []).map((m) => m.name || "");
}

/** Fail early, before any long computation, if a model cannot be used. */
export async function checkModel(model, url = DEFAULT_URL, options = {}) {
  const installed = await installedModels(url, options);
  if (!installed.includes(model) && !installed.includes(`${model}:latest`)) {
    throw new OllamaError(`missing:${model}:${installed.sort().join(", ")}`);
  }
}

/** Embed texts with an Ollama embedding model; returns one array per text. */
export async function embed(model, texts, url = DEFAULT_URL, options = {}) {
  const data = await ollamaCall(url, "/api/embed", { model, input: texts }, options);
  return data.embeddings;
}
