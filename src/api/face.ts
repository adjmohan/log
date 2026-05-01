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

const API_BASE_URLS = buildApiBases();

const getErrorText = async (response: Response) => {
  try {
    return await response.text();
  } catch {
    return "";
  }
};

const normalizeVector = (values: number[]) => {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude <= 0) {
    return values;
  }
  return values.map((value) => value / magnitude);
};

export const averageEmbeddings = (embeddings: number[][]) => {
  const valid = embeddings.filter(
    (vector) =>
      Array.isArray(vector) &&
      vector.length > 0 &&
      vector.every((value) => typeof value === "number" && Number.isFinite(value))
  );

  if (!valid.length) return [];

  const length = valid[0].length;
  const sameLength = valid.filter((vector) => vector.length === length);
  if (!sameLength.length) return [];

  const averaged = Array.from({ length }, (_, index) => {
    const total = sameLength.reduce((sum, vector) => sum + vector[index], 0);
    return total / sameLength.length;
  });

  return normalizeVector(averaged).map((value) => Number(value.toFixed(6)));
};

export const saveFaceEmbedding = async (userId: string, embedding: number[]) => {
  const embeddings = [embedding];

  let lastError: unknown = null;

  for (const baseUrl of API_BASE_URLS) {
    const endpoint = `${baseUrl}/save-face`;

    try {
      console.log(`[saveFaceEmbedding] Trying endpoint: ${endpoint}`);
      console.log("Sending data:", {
        userId,
        embeddingVectors: embeddings.length,
        firstEmbeddingLength: embedding.length,
      });

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, embeddings }),
      });

      if (!response.ok) {
        const message = await getErrorText(response);
        throw new Error(message || `Failed to save face embedding (${response.status})`);
      }

      const result = await response.json();
      console.log("Server response:", result);
      return result;
    } catch (error: any) {
      lastError = error;
      const message = error?.message || String(error);
      if (!message.includes("fetch") && !message.includes("Failed to fetch")) {
        break;
      }
    }
  }

  console.error("[saveFaceEmbedding] FAILED:", lastError instanceof Error ? lastError.message : lastError);
  throw new Error(`Face save failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
};

export const getFaceEmbedding = async (userId: string): Promise<number[] | null> => {
  let lastError: unknown = null;

  for (const baseUrl of API_BASE_URLS) {
    const endpoint = `${baseUrl}/get-face/${encodeURIComponent(userId)}`;

    try {
      console.log(`[getFaceEmbedding] Trying endpoint: ${endpoint}`);
      const response = await fetch(endpoint);

      if (response.status === 404) {
        console.log(`[getFaceEmbedding] No face found (404) via ${endpoint}`);
        return null;
      }

      if (!response.ok) {
        const message = await getErrorText(response);
        throw new Error(message || `Failed to load face embedding (${response.status})`);
      }

      const data = await response.json();
      console.log(`[getFaceEmbedding] SUCCESS via ${endpoint}`);
      if (!Array.isArray(data?.embeddings) || !Array.isArray(data.embeddings[0])) {
        return null;
      }
      const averaged = averageEmbeddings(data.embeddings);
      return averaged.length ? averaged : data.embeddings[data.embeddings.length - 1];
    } catch (error: any) {
      lastError = error;
      const message = error?.message || String(error);
      if (!message.includes("fetch") && !message.includes("Failed to fetch")) {
        break;
      }
    }
  }

  console.error("[getFaceEmbedding] FAILED:", lastError instanceof Error ? lastError.message : lastError);
  throw new Error(`Face fetch failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
};

interface RegisterUserPayload {
  userId: string;
  embeddings: number[][];
  name?: string;
  age?: number;
  weight?: number;
  height?: number;
  email?: string;
  phone?: string;
  goal?: string;
}

export const registerUserWithFace = async (data: any) => {
  const normalizedEmbeddings: number[][] = Array.isArray(data?.embeddings)
    ? data.embeddings
    : (Array.isArray(data?.embedding) ? [data.embedding] : []);
  const payload = {
    ...data,
    embeddings: normalizedEmbeddings,
  };
  delete payload.embedding;
  
  let lastError: unknown = null;

  for (const baseUrl of API_BASE_URLS) {
    const endpoint = `${baseUrl}/register-user`;

    console.log("[registerUserWithFace] Sending data:", {
      userId: payload.userId,
      embeddingVectors: normalizedEmbeddings.length,
      firstEmbeddingLength: normalizedEmbeddings[0]?.length || 0,
      hasName: !!payload.name,
      endpoint,
    });

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      console.log("[registerUserWithFace] Server response:", result);

      if (!res.ok) {
        const errorMsg = result.error || result.message || `HTTP ${res.status}`;
        console.error("[registerUserWithFace] Server error:", errorMsg);
        throw new Error(`Server error: ${errorMsg}`);
      }

      return result;
    } catch (error: any) {
      lastError = error;
      const errorMsg = error?.message || String(error);

      if (errorMsg.includes('fetch') || errorMsg.includes('Failed to fetch')) {
        continue;
      }

      if (errorMsg.includes('JSON')) {
        throw new Error(`Server returned invalid response. Server may be down.`);
      }

      throw new Error(`Failed to save: ${errorMsg}`);
    }
  }

  const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Network error - cannot reach server. Last error: ${errorMsg}`);
};

export const getServerUserProfile = async (userId: string): Promise<{ weight?: number } | null> => {
  let lastError: unknown = null;

  for (const baseUrl of API_BASE_URLS) {
    const endpoint = `${baseUrl}/user/${encodeURIComponent(userId)}`;

    try {
      const response = await fetch(endpoint);
      if (response.status === 404) return null;
      if (!response.ok) {
        const message = await getErrorText(response);
        throw new Error(message || `Failed to load user profile (${response.status})`);
      }
      return await response.json();
    } catch (error: any) {
      lastError = error;
      const message = error?.message || String(error);
      if (!message.includes("fetch") && !message.includes("Failed to fetch")) {
        break;
      }
    }
  }

  console.warn("[getServerUserProfile] FAILED:", lastError instanceof Error ? lastError.message : lastError);
  return null;
};
