import { Preferences } from "@capacitor/preferences";
import { Network } from "@capacitor/network";
import { postFitnessDelta, type FitnessDeltaPayload } from "../api/fitness";

const OFFLINE_QUEUE_KEY = "offlineQueue";
const MAX_QUEUE_ITEMS = 1000;

let listenerAttached = false;

const readQueue = async (): Promise<FitnessDeltaPayload[]> => {
  const { value } = await Preferences.get({ key: OFFLINE_QUEUE_KEY });
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeQueue = async (queue: FitnessDeltaPayload[]) => {
  await Preferences.set({ key: OFFLINE_QUEUE_KEY, value: JSON.stringify(queue) });
};

export const saveOfflineDelta = async (item: FitnessDeltaPayload) => {
  const queue = await readQueue();
  queue.push(item);

  while (queue.length > MAX_QUEUE_ITEMS) {
    queue.shift();
  }

  await writeQueue(queue);
};

export const isOnline = async () => {
  const status = await Network.getStatus();
  return Boolean(status.connected);
};

export const syncOfflineQueue = async () => {
  const queue = await readQueue();
  if (!queue.length) {
    return;
  }

  const remaining: FitnessDeltaPayload[] = [];

  for (const item of queue) {
    try {
      await postFitnessDelta(item);
    } catch {
      remaining.push(item);
    }
  }

  await writeQueue(remaining);
};

export const sendFitnessDelta = async (item: FitnessDeltaPayload) => {
  if (await isOnline()) {
    try {
      await postFitnessDelta(item);
      return;
    } catch {
      await saveOfflineDelta(item);
      return;
    }
  }

  await saveOfflineDelta(item);
};

export const initNetworkSync = async () => {
  if (listenerAttached) {
    return;
  }

  listenerAttached = true;

  Network.addListener("networkStatusChange", (status) => {
    if (status.connected) {
      syncOfflineQueue().catch(() => {
        // Keep queue as-is on sync failure.
      });
    }
  });

  await syncOfflineQueue();
};
