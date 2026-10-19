import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ admin: vi.fn(), reset: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: state.admin }));
vi.mock("@/lib/password-reset", () => ({ requestPasswordReset: state.reset }));
import { POST } from "@/app/api/auth/forgot-password/route";

afterEach(() => vi.resetAllMocks());

it("never creates or discloses a reset token to an anonymous or ordinary user", async () => {
  state.admin.mockResolvedValue(null);
  const response = await POST(new Request("https://example.com/api/auth/forgot-password", {
    method: "POST", body: JSON.stringify({ username: "victim@example.com" }),
  }));
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "Contact your administrator to reset your password.", code: "reset_admin_required" });
  expect(state.reset).not.toHaveBeenCalled();
});

it("permits an authenticated administrator to issue a reset link", async () => {
  state.admin.mockResolvedValue({ id: "admin", role: "admin" });
  state.reset.mockReturnValue({ status: "ready", resetUrl: "https://example.com/reset-password?token=test" });
  const response = await POST(new Request("https://example.com/api/auth/forgot-password", {
    method: "POST", body: JSON.stringify({ username: "person@example.com" }),
  }));
  expect(response.status).toBe(200);
  expect((await response.json()).resetUrl).toContain("token=test");
});
