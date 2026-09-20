import { describe, expect, it, vi } from "vitest";
import { api } from "./client";

describe("api client", () => {
  it("preserves admin API paths and reports server errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: "Invalid model" }),
      }),
    );
    await expect(api.publishModel({ name: "Thing" })).rejects.toThrow(
      "Invalid model",
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/admin/api/models/publish"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
