// Render Worker HTTP Client
// Thay thế pg-boss trong Functions - gọi HTTP đến render worker

export interface VideoRenderJob {
  prId: string;
  songIds: number[];
}

export const QUEUE_NAME = "video-render";

// Get render worker URL from env
function getRenderWorkerUrl(env: any): string {
  return env.RENDER_WORKER_URL || "http://localhost:3001";
}

export async function enqueueVideoRender(
  env: any,
  job: VideoRenderJob
): Promise<string | null> {
  const url = `${getRenderWorkerUrl(env)}/enqueue`;
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.BOT_SECRET || env.WORKER_SECRET}`,
      },
      body: JSON.stringify(job),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[queue] Enqueue failed:", response.status, error);
      return null;
    }

    const result = await response.json() as { jobId?: string };
    return result.jobId || "enqueued";
  } catch (err) {
    console.error("[queue] Enqueue error:", err);
    return null;
  }
}

// For local development / testing
export async function enqueueVideoRenderDirect(
  connectionString: string,
  job: VideoRenderJob
): Promise<string | null> {
  // Fallback: direct pg-boss if needed (for worker internal use)
  // This won't be bundled in Functions
  return null;
}