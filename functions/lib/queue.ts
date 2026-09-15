import { PgBoss } from "pg-boss";

let queueInstance: PgBoss | null = null;

export function getQueue(connectionString: string): PgBoss {
  if (queueInstance) return queueInstance;

  queueInstance = new PgBoss(connectionString);
  return queueInstance;
}

export async function initializeQueue(connectionString: string): Promise<PgBoss> {
  const queue = getQueue(connectionString);
  await queue.start();
  return queue;
}

export async function closeQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.stop();
    queueInstance = null;
  }
}

// Job types
export interface VideoRenderJob {
  prId: string;
  songIds: number[]; // ann_song_id array
}

export const QUEUE_NAME = "video-render";

export async function enqueueVideoRender(
  queue: PgBoss,
  job: VideoRenderJob
): Promise<string | null> {
  return queue.send(QUEUE_NAME, job, {
    retryLimit: 1,
    retryDelay: 30000, // 30 seconds
    priority: 0,
  });
}