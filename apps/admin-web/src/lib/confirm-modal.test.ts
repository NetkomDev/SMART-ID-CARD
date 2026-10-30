import { describe, it, expect } from "vitest";
import { confirmModal } from "./confirm-modal";

describe("confirmModal", () => {
  it("resolves to false when document is undefined (SSR / non-DOM environments)", async () => {
    const result = await confirmModal({
      title: "Konfirmasi",
      message: "Testing in node environment",
      variant: "warning"
    });
    expect(result).toBe(false);
  });
});
