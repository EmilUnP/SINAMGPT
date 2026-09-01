import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MAIL_FROM, getMailFrom, isMailConfigured, sendMail } from "@/lib/mail";

describe("mail helper", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("treats a missing API key as unconfigured", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(isMailConfigured()).toBe(false);
  });

  it("defaults the From address to Resend's test sender", () => {
    vi.stubEnv("MAIL_FROM", "");
    expect(getMailFrom()).toBe(DEFAULT_MAIL_FROM);
  });

  it("sends through the Resend HTTP API", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("MAIL_FROM", "SINAMGPT <onboarding@resend.dev>");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendMail({
      to: "you@company.com",
      subject: "Reset",
      text: "link",
      html: "<p>link</p>",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("https://api.resend.com/emails");
    const init = call?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_test",
    });
  });

  it("surfaces Resend error messages", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: "only your own email" }), {
            status: 403,
          }),
      ),
    );

    await expect(
      sendMail({
        to: "other@company.com",
        subject: "Reset",
        text: "link",
        html: "<p>link</p>",
      }),
    ).rejects.toMatchObject({
      name: "MailError",
      message: "only your own email",
    });
  });
});
