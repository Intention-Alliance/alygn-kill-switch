import { describe, it, expect } from "bun:test";
import { friendlyErrorMessage, ApiError } from "@/lib/api-client";

// ─── friendlyErrorMessage ───────────────────────────────────────────

describe("friendlyErrorMessage", () => {
  it("maps 429 to friendly rate-limit copy regardless of body", () => {
    expect(friendlyErrorMessage("", 429)).toBe(
      "Too many requests. Please wait a moment.",
    );
    expect(friendlyErrorMessage('{"error":"Rate limit exceeded"}', 429)).toBe(
      "Too many requests. Please wait a moment.",
    );
  });

  it("extracts a readable message from a JSON error body", () => {
    const raw = JSON.stringify({ error: "Rate limit exceeded", limit: 60 });
    expect(friendlyErrorMessage(raw, 400)).toBe("Rate limit exceeded");
  });

  it("extracts from the message field", () => {
    const raw = JSON.stringify({ message: "Invalid request" });
    expect(friendlyErrorMessage(raw, 400)).toBe("Invalid request");
  });

  it("extracts from the detail field", () => {
    const raw = JSON.stringify({ detail: "Machine not found" });
    expect(friendlyErrorMessage(raw, 404)).toBe("Machine not found");
  });

  it("extracts from the reason field", () => {
    const raw = JSON.stringify({ reason: "Unauthorized" });
    expect(friendlyErrorMessage(raw, 401)).toBe("Unauthorized");
  });

  it("prefers error over other candidate fields", () => {
    const raw = JSON.stringify({ message: "fallback", error: "real error" });
    expect(friendlyErrorMessage(raw, 400)).toBe("real error");
  });

  it("trims whitespace from extracted messages", () => {
    const raw = JSON.stringify({ error: "  spaced out  " });
    expect(friendlyErrorMessage(raw, 400)).toBe("spaced out");
  });

  it("ignores empty/whitespace-only candidate fields and falls back to raw text", () => {
    const raw = JSON.stringify({ error: "   " });
    expect(friendlyErrorMessage(raw, 400)).toBe(raw);
  });

  it("falls back to raw text when the body is not JSON", () => {
    expect(friendlyErrorMessage("plain text error", 500)).toBe(
      "plain text error",
    );
  });

  it("returns a generic message for an empty body", () => {
    expect(friendlyErrorMessage("", 500)).toBe("Request failed (HTTP 500)");
  });

  it("returns a generic message for whitespace-only body", () => {
    expect(friendlyErrorMessage("   ", 503)).toBe("Request failed (HTTP 503)");
  });
});

// ─── ApiError ───────────────────────────────────────────────────────

describe("ApiError", () => {
  it("carries the HTTP status and message", () => {
    const err = new ApiError("boom", 500);
    expect(err.message).toBe("boom");
    expect(err.status).toBe(500);
    expect(err.name).toBe("ApiError");
    expect(err).toBeInstanceOf(Error);
  });
});
