/* api.ts — error normalisation into ApiError, plus the request shape the
   thin `api.*` helpers send. fetch is stubbed; no API needed. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE, ApiError, api, apiFetch } from "./api";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

async function catchApiError(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error("expected the request to reject");
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("apiFetch — success paths", () => {
  it("prefixes API_BASE and returns the parsed JSON body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "r1" }));
    await expect(apiFetch("/repos/r1")).resolves.toEqual({ id: "r1" });
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/repos/r1`, expect.any(Object));
  });

  it("returns undefined for 204 No Content without reading the body", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api.del("/runs/x")).resolves.toBeUndefined();
  });

  it("sets content-type only when a body is sent, and lets caller headers win", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ ok: true }));

    await api.post("/repos/r1/refresh");
    const [, bodyless] = fetchMock.mock.calls[0]!;
    expect(bodyless?.method).toBe("POST");
    expect(bodyless?.body).toBeUndefined();
    expect(bodyless?.headers).toEqual({});

    await api.put("/settings", { theme: "dark" });
    const [, withBody] = fetchMock.mock.calls[1]!;
    expect(withBody?.method).toBe("PUT");
    expect(withBody?.body).toBe(JSON.stringify({ theme: "dark" }));
    expect(withBody?.headers).toEqual({ "content-type": "application/json" });

    await apiFetch("/x", { method: "PATCH", body: "raw", headers: { "content-type": "text/plain" } });
    const [, overridden] = fetchMock.mock.calls[2]!;
    expect(overridden?.headers).toEqual({ "content-type": "text/plain" });
  });
});

describe("apiFetch — error normalisation", () => {
  it("maps the server error envelope onto ApiError fields", async () => {
    const details = { field: "url", reason: "not a GitHub URL" };
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: "validation_error", message: "Invalid repo URL", details } },
        { status: 400, statusText: "Bad Request" },
      ),
    );

    const err = await catchApiError(api.post("/repos", { url: "nope" }));
    expect(err.name).toBe("ApiError");
    expect(err.status).toBe(400);
    expect(err.code).toBe("validation_error");
    expect(err.message).toBe("Invalid repo URL");
    expect(err.details).toEqual(details);
  });

  it("falls back to 'status statusText' when the envelope has no message", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: "not_found" } }, { status: 404, statusText: "Not Found" }),
    );
    const err = await catchApiError(api.get("/pulls/9"));
    expect(err).toMatchObject({ status: 404, code: "not_found", message: "404 Not Found" });
    expect(err.details).toBeUndefined();
  });

  it("ignores a JSON error body that is not the envelope", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: "boom" }, { status: 500, statusText: "Internal Server Error" }),
    );
    const err = await catchApiError(api.get("/repos"));
    expect(err).toMatchObject({ status: 500, message: "500 Internal Server Error" });
    expect(err.code).toBeUndefined();
    expect(err.details).toBeUndefined();
  });

  it("handles a non-JSON error body (e.g. an HTML proxy page)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>Bad Gateway</html>", { status: 502, statusText: "Bad Gateway" }),
    );
    const err = await catchApiError(api.get("/repos"));
    expect(err).toMatchObject({ status: 502, message: "502 Bad Gateway" });
    expect(err.code).toBeUndefined();
  });

  it("handles an empty error body", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503, statusText: "Service Unavailable" }));
    const err = await catchApiError(api.get("/repos"));
    expect(err).toMatchObject({ status: 503, message: "503 Service Unavailable" });
  });

  it("turns a network failure into status 0 / network_error with the cause in details", async () => {
    const cause = new TypeError("Failed to fetch");
    fetchMock.mockRejectedValueOnce(cause);
    const err = await catchApiError(api.get("/repos"));
    expect(err.status).toBe(0);
    expect(err.code).toBe("network_error");
    expect(err.message).toContain(API_BASE);
    expect(err.details).toBe(cause);
  });
});
