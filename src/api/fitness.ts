const buildApiBases = () => {
  const bases = [import.meta.env.VITE_API_BASE_URL];

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      bases.push(`http://${host}:3000`);
    }
  }

  bases.push(
    "http://192.168.1.34:3000",
    "http://10.0.2.2:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  );

  return Array.from(new Set(bases.filter(Boolean)));
};

export interface FitnessDeltaPayload {
  userId: string;
  steps: number;
  calories: number;
  activity: string;
  timestamp: number;
}

const endpoints = buildApiBases();

const parseError = async (response: Response) => {
  try {
    return await response.text();
  } catch {
    return "";
  }
};

export const postFitnessDelta = async (payload: FitnessDeltaPayload) => {
  let lastError: unknown = null;

  for (const base of endpoints) {
    try {
      const response = await fetch(`${base}/save-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await parseError(response);
        throw new Error(message || `save-data failed (${response.status})`);
      }

      return response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError instanceof Error ? lastError.message : "Failed to post fitness data");
};

export interface DashboardSummary {
  today: {
    steps: number;
    calories: number;
    activity?: string;
  };
  week: {
    steps: number;
    calories: number;
  };
  month: {
    steps: number;
    calories: number;
  };
}

export const getDashboardSummary = async (userId: string): Promise<DashboardSummary> => {
  let lastError: unknown = null;

  for (const base of endpoints) {
    try {
      const response = await fetch(`${base}/dashboard/${encodeURIComponent(userId)}`);

      if (!response.ok) {
        const message = await parseError(response);
        throw new Error(message || `dashboard fetch failed (${response.status})`);
      }

      return response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError instanceof Error ? lastError.message : "Failed to load dashboard summary");
};
