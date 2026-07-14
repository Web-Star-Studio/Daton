import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "@/lib/api-error";

describe("apiErrorMessage", () => {
  // ApiError.message reads "HTTP 502 Bad Gateway: <reason>" — fine for a log,
  // noise for a toast the client reads.
  it("prefers the server's reason over the HTTP-prefixed message", () => {
    const error = {
      message: "HTTP 502 Bad Gateway: A IA consumiu todo o limite de tokens.",
      data: { error: "A IA consumiu todo o limite de tokens." },
    };

    expect(apiErrorMessage(error)).toBe("A IA consumiu todo o limite de tokens.");
  });

  it("falls back to the message when the body carries no reason", () => {
    expect(apiErrorMessage({ message: "Failed to fetch", data: null })).toBe("Failed to fetch");
    expect(apiErrorMessage(new Error("Network down"))).toBe("Network down");
  });

  it("ignores a blank or non-string reason", () => {
    expect(apiErrorMessage({ message: "HTTP 500", data: { error: "   " } })).toBe("HTTP 500");
    expect(apiErrorMessage({ message: "HTTP 500", data: { error: 42 } })).toBe("HTTP 500");
  });

  it("returns undefined when there is nothing to show", () => {
    expect(apiErrorMessage(null)).toBeUndefined();
    expect(apiErrorMessage("boom")).toBeUndefined();
    expect(apiErrorMessage({})).toBeUndefined();
  });
});
