/**
 * Can this browser open the camera at all? QR scanner apps often open links in their own in-app
 * browser (Instagram, Facebook, LinkedIn, the Google app, WeChat, Android WebViews...), where
 * getUserMedia is missing or always blocked. Detect that before the user taps Start.
 */
export type CameraProblem = "insecure" | "no-media-devices" | "in-app-browser" | null;

const IN_APP = [
  /Instagram/i,
  /FBAN|FBAV|FB_IAB|FBIOS/i, // Facebook, Messenger
  /LinkedInApp/i,
  /Twitter|TwitterAndroid/i,
  /MicroMessenger/i, // WeChat
  /Line\//i,
  /Snapchat/i,
  /TikTok|musical_ly|BytedanceWebview/i,
  /\bGSA\//i, // Google app on iOS
  /; wv\)/i, // Android WebView
];

export function isInAppBrowser(ua: string): boolean {
  return IN_APP.some((re) => re.test(ua));
}

export function cameraProblem(env: {
  readonly userAgent: string;
  readonly isSecureContext: boolean;
  readonly hasGetUserMedia: boolean;
}): CameraProblem {
  if (!env.isSecureContext) return "insecure";
  if (!env.hasGetUserMedia) return isInAppBrowser(env.userAgent) ? "in-app-browser" : "no-media-devices";
  if (isInAppBrowser(env.userAgent)) return "in-app-browser";
  return null;
}

export function isAndroid(ua: string): boolean {
  return /Android/i.test(ua);
}

export function isIos(ua: string): boolean {
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
}

/** Android intent link that opens the same https URL in Chrome. */
export function chromeIntentUrl(url: string): string {
  const u = new URL(url);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}

/** Human help for a getUserMedia error name. */
export function cameraErrorHelp(name: string, ua: string): string {
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return isIos(ua)
        ? "Camera permission is blocked. In Safari tap aA in the address bar, then Website Settings, Camera, Allow, and reload."
        : "Camera permission is blocked. Tap the icon left of the address, then Permissions (or Site settings), Camera, Allow, and reload.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found. Try Flip camera, or the Demo clip.";
    case "NotReadableError":
    case "AbortError":
      return "The camera is busy. Close other apps that use it (camera, video calls) and tap Start again.";
    default:
      return "The camera could not be opened.";
  }
}
