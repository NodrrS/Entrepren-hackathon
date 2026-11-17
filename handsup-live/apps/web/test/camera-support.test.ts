import { describe, expect, it } from "vitest";
import { cameraErrorHelp, cameraProblem, chromeIntentUrl, isInAppBrowser } from "../src/live/camera-support";

const IOS_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const ANDROID_WEBVIEW = "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36";
const INSTAGRAM = IOS_SAFARI.replace("Safari/604.1", "Instagram 300.0.0.0 (iPhone15,2; iOS 18_1)");
const GOOGLE_APP_IOS = IOS_SAFARI.replace("Version/18.1", "GSA/300.0.0").replace(" Safari/604.1", "");

describe("camera support", () => {
  it("accepts real browsers", () => {
    for (const ua of [IOS_SAFARI, ANDROID_CHROME]) {
      expect(isInAppBrowser(ua)).toBe(false);
      expect(cameraProblem({ userAgent: ua, isSecureContext: true, hasGetUserMedia: true })).toBeNull();
    }
  });

  it("flags in-app browsers from QR scanners and social apps", () => {
    for (const ua of [ANDROID_WEBVIEW, INSTAGRAM, GOOGLE_APP_IOS]) {
      expect(cameraProblem({ userAgent: ua, isSecureContext: true, hasGetUserMedia: true })).toBe("in-app-browser");
    }
  });

  it("flags a missing mediaDevices and an insecure page", () => {
    expect(cameraProblem({ userAgent: IOS_SAFARI, isSecureContext: true, hasGetUserMedia: false })).toBe("no-media-devices");
    expect(cameraProblem({ userAgent: IOS_SAFARI, isSecureContext: false, hasGetUserMedia: true })).toBe("insecure");
  });

  it("builds a Chrome intent link and error help", () => {
    expect(chromeIntentUrl("https://live.handsupai.com/live/")).toBe(
      "intent://live.handsupai.com/live/#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Flive.handsupai.com%2Flive%2F;end",
    );
    expect(cameraErrorHelp("NotAllowedError", IOS_SAFARI)).toMatch(/Website Settings/);
    expect(cameraErrorHelp("NotReadableError", ANDROID_CHROME)).toMatch(/busy/);
  });
});
