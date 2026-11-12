import { describe, expect, it } from "vitest";
import { clerkFrontendApi } from "./clerk";

describe("clerkFrontendApi", () => {
  it("reads the Frontend API host out of a publishable key", () => {
    expect(clerkFrontendApi("pk_test_bm92ZWwtd2FydGhvZy0zMTAuY2xlcmsuYWNjb3VudHMuZGV2JA")).toBe("novel-warthog-310.clerk.accounts.dev");
    expect(clerkFrontendApi(`pk_live_${btoa("clerk.example.com$")}`)).toBe("clerk.example.com");
  });

  it("returns null for anything that is not a publishable key", () => {
    expect(clerkFrontendApi("")).toBeNull();
    expect(clerkFrontendApi("sk_test_abc")).toBeNull();
    expect(clerkFrontendApi("pk_test_!!!")).toBeNull();
    expect(clerkFrontendApi(`pk_test_${btoa("no-dollar-at-the-end")}`)).toBeNull();
  });
});
