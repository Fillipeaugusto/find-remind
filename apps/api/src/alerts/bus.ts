import type { Redis } from "ioredis";
import type { Alert } from "../modules/alerts/alerts.schemas.js";

export type AlertListener = (alert: Alert) => void;

export function alertChannel(userId: string): string {
  return `alerts:${userId}`;
}

// Fans alerts out to the SSE streams of this process through Redis pub/sub,
// so alerts fired by any worker reach every API instance. A single
// subscriber connection serves all streams: Redis puts a connection in
// subscribe mode, so the shared client cannot be reused for it.
export function createAlertBus(redis: Redis, onError: (err: Error) => void) {
  const subscriber = redis.duplicate({ maxRetriesPerRequest: null, lazyConnect: true });
  const listeners = new Map<string, Set<AlertListener>>();

  subscriber.on("error", onError);
  subscriber.on("message", (channel: string, message: string) => {
    const channelListeners = listeners.get(channel);
    if (!channelListeners) return;
    let alert: Alert;
    try {
      alert = JSON.parse(message) as Alert;
    } catch (err) {
      onError(err as Error);
      return;
    }
    for (const listener of channelListeners) listener(alert);
  });

  return {
    async start(): Promise<void> {
      await subscriber.connect();
    },

    async publish(userId: string, alert: Alert): Promise<void> {
      await redis.publish(alertChannel(userId), JSON.stringify(alert));
    },

    // Resolves once the channel is subscribed; the returned function removes
    // the listener and drops the channel when it was the last one.
    async subscribe(userId: string, listener: AlertListener): Promise<() => Promise<void>> {
      const channel = alertChannel(userId);
      let channelListeners = listeners.get(channel);
      if (!channelListeners) {
        channelListeners = new Set();
        listeners.set(channel, channelListeners);
        try {
          await subscriber.subscribe(channel);
        } catch (error) {
          if (listeners.get(channel) === channelListeners) listeners.delete(channel);
          throw error;
        }
      }
      channelListeners.add(listener);

      return async () => {
        channelListeners.delete(listener);
        if (channelListeners.size > 0 || listeners.get(channel) !== channelListeners) return;
        listeners.delete(channel);
        await subscriber.unsubscribe(channel);
      };
    },

    subscriberCount(userId: string): number {
      return listeners.get(alertChannel(userId))?.size ?? 0;
    },

    async close(): Promise<void> {
      listeners.clear();
      if (subscriber.status === "end") return;
      try {
        await subscriber.quit();
      } finally {
        subscriber.disconnect();
      }
    },
  };
}

export type AlertBus = ReturnType<typeof createAlertBus>;
