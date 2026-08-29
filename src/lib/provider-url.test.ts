import { describe, expect, it } from "vitest";
import {
  isCloudMetadataHostname,
  isPrivateOrLocalHostname,
  providerUrlIsRemote,
} from "@/lib/provider-url";

describe("provider URL safety", () => {
  it.each([
    "169.254.169.254",
    "metadata.google.internal",
    "100.100.100.200",
    "::ffff:169.254.169.254",
    "::ffff:a9fe:a9fe",
    "fd00:ec2::254",
    "fe80::1",
  ])("flags %s as cloud metadata", (host) => {
    expect(isCloudMetadataHostname(host)).toBe(true);
  });

  it("allows ordinary LAN and public hosts", () => {
    expect(isCloudMetadataHostname("10.0.0.22")).toBe(false);
    expect(isCloudMetadataHostname("api.openai.com")).toBe(false);
    expect(isPrivateOrLocalHostname("192.168.1.9")).toBe(true);
    expect(providerUrlIsRemote("https://api.openai.com/v1")).toBe(true);
  });
});
