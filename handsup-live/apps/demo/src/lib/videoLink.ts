/**
 * Gets a short YouTube video through this page's own server (POST /api/video, which runs yt-dlp) as a File, so
 * the page can read it like an uploaded clip. The server's plain-language error message is passed on.
 */
export async function fetchVideo(url: string, signal?: AbortSignal): Promise<File> {
  const res = await fetch("/api/video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: url.trim() }),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) {
    let msg = "The video could not be fetched. Try again.";
    try {
      const d = (await res.json()) as { error?: string };
      if (typeof d.error === "string" && d.error) msg = d.error;
    } catch { /* keep the default message */ }
    throw new Error(msg);
  }
  return new File([await res.blob()], "youtube-clip.mp4", { type: "video/mp4" });
}
