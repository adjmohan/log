const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const dns = require("dns");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const app = express();
const port = process.env.PORT || 3000;
const mongoUrl = process.env.MONGODB_URL || "YOUR_MONGODB_URL";

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// NEW: Request Logger to see if the phone is connecting
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip}`);
  if (req.method === "POST") {
    console.log("Request Body Keys:", Object.keys(req.body));
  }
  next();
});

const fitnessSchema = new mongoose.Schema(
  {
    userId: String,
    steps: Number,
    calories: Number,
    activity: String,
    day: String,
    week: String,
    month: String,
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "data" }
);

fitnessSchema.index({ userId: 1, day: 1 }, { unique: true });

const Fitness = mongoose.model("data", fitnessSchema);

const workoutSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    exercise: { type: String, required: true },
    reps: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0 },
    calories: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now },
    syncedAt: { type: Date, default: null },
  },
  { collection: "workouts" }
);

const Workout = mongoose.model("workouts", workoutSchema);

const faceSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    embeddings: {
      type: [[Number]],
      default: [],
    },
  },
  {
    collection: "faces",
    timestamps: true,
  }
);

const Face = mongoose.model("faces", faceSchema);

function isExactEmbeddingVector(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function isExactEmbeddingsList(value) {
  return Array.isArray(value) && value.length > 0 && value.every((vector) => isExactEmbeddingVector(vector));
}

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: null },
    age: { type: Number, default: null },
    weight: { type: Number, default: null },
    height: { type: Number, default: null },
    email: { type: String, default: null },
    phone: { type: String, default: null },
    goal: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "users" }
);

const User = mongoose.model("users", userSchema);

mongoose
  .connect(mongoUrl, {
    dbName: process.env.MONGODB_DB || "fitness",
  })
  .then(() => {
    console.log("═══════════════════════════════════════════");
    console.log("✅ MongoDB CONNECTED SUCCESSFULLY");
    console.log("Database:", process.env.MONGODB_DB || "fitness");
    console.log("Connected at:", new Date().toISOString());
    console.log("═══════════════════════════════════════════\n");
  })
  .catch((error) => {
    console.error("═══════════════════════════════════════════");
    console.error("❌ MongoDB CONNECTION FAILED");
    console.error("Error:", error.message);
    console.error("URL:", mongoUrl.replace(/\/\/.*@/, "//***:***@"));
    console.error("═══════════════════════════════════════════\n");
    process.exit(1);
  });

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/save-face", async (req, res) => {
  try {
    console.log("═══════════════════════════════════════════");
    console.log("[/save-face] Request received at", new Date().toISOString());
    
    const userId = String(req.body?.userId || "").trim();
    const embeddings = req.body?.embeddings;

    console.log("[/save-face] Parsed data:", {
      userId,
      embeddingVectors: Array.isArray(embeddings) ? embeddings.length : 0,
      firstEmbeddingLength: Array.isArray(embeddings?.[0]) ? embeddings[0].length : 0,
      embeddingsValid: isExactEmbeddingsList(embeddings)
    });

    if (!userId) {
      console.error("[/save-face] VALIDATION ERROR: userId is missing");
      return res.status(400).json({ error: "userId is required" });
    }

    if (!isExactEmbeddingsList(embeddings)) {
      console.error("[/save-face] VALIDATION ERROR: embeddings are invalid or empty");
      if (Array.isArray(embeddings)) {
        console.log("[/save-face] Embeddings received sample:", embeddings[0]?.slice?.(0, 10));
      }
      return res.status(400).json({
        error: "Embeddings must be a non-empty array of embedding vectors (number[][] exact format)."
      });
    }

    const now = new Date();
    console.log("[/save-face] Upserting face document for userId:", userId);
    
    const saved = await Face.findOneAndUpdate(
      { userId },
      {
        $set: {
          userId,
          embeddings: embeddings.map((vector) => vector.slice()),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log("[/save-face] ✅ SUCCESS: Face saved for user:", userId, {
      docId: saved._id,
      embeddingVectors: saved.embeddings.length,
      firstEmbeddingLength: saved.embeddings[0]?.length || 0,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt
    });
    console.log("═══════════════════════════════════════════\n");
    
    return res.json({ message: "Face saved", data: saved });
  } catch (error) {
    console.error("═══════════════════════════════════════════");
    console.error("[/save-face] ❌ ERROR:", error.message);
    console.error("Stack trace:", error.stack);
    console.error("═══════════════════════════════════════════\n");
    return res.status(500).json({ error: error.message });
  }
});

app.post("/register-user", async (req, res) => {
  try {
    console.log("═══════════════════════════════════════════");
    console.log("[/register-user] Incoming request at", new Date().toISOString());
    console.log("Request body keys:", Object.keys(req.body));
    console.log("═══════════════════════════════════════════");

    const userId = String(req.body?.userId || "").trim();
    const embeddings = req.body?.embeddings;
    const name = req.body?.name ? String(req.body.name).trim() : null;
    const age = Number.isFinite(Number(req.body?.age)) ? Number(req.body.age) : null;
    const weight = Number.isFinite(Number(req.body?.weight)) ? Number(req.body.weight) : null;
    const height = Number.isFinite(Number(req.body?.height)) ? Number(req.body.height) : null;
    const email = req.body?.email ? String(req.body.email).trim().toLowerCase() : null;
    const phone = req.body?.phone ? String(req.body.phone).trim() : null;
    const goal = req.body?.goal ? String(req.body.goal).trim() : null;

    console.log("[/register-user] Parsed data:", {
      userId,
      embeddingVectors: Array.isArray(embeddings) ? embeddings.length : 0,
      firstEmbeddingLength: Array.isArray(embeddings?.[0]) ? embeddings[0].length : 0,
      hasEmbeddingValues: Array.isArray(embeddings) && embeddings.length > 0,
      name,
      email,
      phone
    });

    if (!userId) {
      console.error("[/register-user] VALIDATION ERROR: userId is missing");
      return res.status(400).json({ error: "userId is required" });
    }

    if (!Array.isArray(embeddings) || !embeddings.length) {
      console.error("[/register-user] VALIDATION ERROR: embeddings are empty or not an array");
      return res.status(400).json({ error: "Face scan required" });
    }

    if (!isExactEmbeddingsList(embeddings)) {
      console.error("[/register-user] VALIDATION ERROR: embeddings format is invalid");
      console.log("Embeddings sample:", embeddings[0]?.slice?.(0, 10));
      return res.status(400).json({
        error: "Embeddings must be a non-empty array of embedding vectors (number[][] exact format)."
      });
    }

    console.log("[/register-user] Saving face embedding to MongoDB...");
    const faceSaved = await Face.findOneAndUpdate(
      { userId },
      {
        $set: {
          userId,
          embeddings: embeddings.map((vector) => vector.slice()),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log("[/register-user] ✅ Face saved for user:", userId, {
      docId: faceSaved._id,
      embeddingVectors: faceSaved.embeddings.length,
      firstEmbeddingLength: faceSaved.embeddings[0]?.length || 0,
      createdAt: faceSaved.createdAt
    });

    console.log("[/register-user] Saving user profile to MongoDB...");
    const userSaved = await User.findOneAndUpdate(
      { userId },
      {
        $set: {
          name,
          age,
          weight,
          height,
          email,
          phone,
          goal,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          userId,
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log("[/register-user] ✅ User saved:", userId, {
      docId: userSaved._id,
      name: userSaved.name,
      email: userSaved.email
    });

    console.log("[/register-user] ✅ SUCCESS: Both face and user saved for userId:", userId);
    console.log("═══════════════════════════════════════════\n");

    return res.json({ message: "User registered successfully", user: userSaved, face: faceSaved });
  } catch (error) {
    console.error("═══════════════════════════════════════════");
    console.error("[/register-user] ❌ ERROR:", error.message);
    console.error("Stack trace:", error.stack);
    console.error("═══════════════════════════════════════════\n");
    return res.status(500).json({ error: error.message });
  }
});

app.get("/get-face/:userId", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();
    const face = await Face.findOne({ userId }).lean();

    if (!face) {
      return res.status(404).json({ error: "Face embedding not found" });
    }

    return res.json({ userId: face.userId, embeddings: face.embeddings, updatedAt: face.updatedAt });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/user/:userId", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const user = await User.findOne({ userId }).lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(user);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/save", async (req, res) => {
  try {
    const { userId, steps = 0, calories = 0, activity = "Idle" } = req.body || {};

    if (!userId || !String(userId).trim()) {
      return res.status(400).json({ error: "userId is required" });
    }

    const now = new Date();
    const day = now.toISOString().split("T")[0];
    const week = `${now.getFullYear()}-W${Math.ceil(now.getDate() / 7)}`;
    const month = `${now.getFullYear()}-${now.getMonth() + 1}`;

    const saved = await Fitness.findOneAndUpdate(
      { userId: String(userId).trim(), day },
      {
        $inc: {
          steps: Number(steps) || 0,
          calories: Number(calories) || 0,
        },
        $set: {
          activity: String(activity || "Idle"),
          week,
          month,
        },
        $setOnInsert: {
          userId: String(userId).trim(),
          day,
          createdAt: now,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({ message: "Saved", data: saved });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/save-data", async (req, res) => {
  try {
    const { userId, steps = 0, calories = 0, activity = "Walking", timestamp } = req.body || {};

    if (!userId || !String(userId).trim()) {
      return res.status(400).json({ error: "userId is required" });
    }

    const now = timestamp ? new Date(timestamp) : new Date();
    const safeNow = Number.isNaN(now.getTime()) ? new Date() : now;
    const day = safeNow.toISOString().slice(0, 10);
    const week = `${safeNow.getFullYear()}-W${Math.ceil(safeNow.getDate() / 7)}`;
    const month = `${safeNow.getFullYear()}-${safeNow.getMonth() + 1}`;

    const saved = await Fitness.findOneAndUpdate(
      { userId: String(userId).trim(), day },
      {
        $inc: {
          steps: Math.max(0, Number(steps) || 0),
          calories: Math.max(0, Number(calories) || 0),
        },
        $set: {
          activity: String(activity || "Walking"),
          week,
          month,
        },
        $setOnInsert: {
          userId: String(userId).trim(),
          day,
          createdAt: safeNow,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({ ok: true, data: saved });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/save-workout", async (req, res) => {
  try {
    const { userId, exercise, reps = 0, durationSeconds = 0, calories = 0, timestamp } = req.body || {};

    if (!userId || !String(userId).trim()) {
      return res.status(400).json({ error: "userId is required" });
    }

    if (!exercise || !String(exercise).trim()) {
      return res.status(400).json({ error: "exercise is required" });
    }

    const safeTimestamp = timestamp ? new Date(timestamp) : new Date();
    const workout = await Workout.create({
      userId: String(userId).trim(),
      exercise: String(exercise).trim(),
      reps: Math.max(0, Number(reps) || 0),
      durationSeconds: Math.max(0, Number(durationSeconds) || 0),
      calories: Math.max(0, Number(calories) || 0),
      timestamp: Number.isNaN(safeTimestamp.getTime()) ? new Date() : safeTimestamp,
      syncedAt: new Date(),
    });

    return res.json({ ok: true, data: workout });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/workouts/:userId", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const workouts = await Workout.find({ userId }).sort({ timestamp: -1 }).lean();
    return res.json(workouts);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/dashboard/:userId", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const week = `${now.getFullYear()}-W${Math.ceil(now.getDate() / 7)}`;
    const month = `${now.getFullYear()}-${now.getMonth() + 1}`;

    const [todayDoc, weekAgg, monthAgg] = await Promise.all([
      Fitness.findOne({ userId, day }).lean(),
      Fitness.aggregate([
        { $match: { userId, week } },
        { $group: { _id: null, steps: { $sum: "$steps" }, calories: { $sum: "$calories" } } },
      ]),
      Fitness.aggregate([
        { $match: { userId, month } },
        { $group: { _id: null, steps: { $sum: "$steps" }, calories: { $sum: "$calories" } } },
      ]),
    ]);

    return res.json({
      today: {
        steps: todayDoc?.steps || 0,
        calories: todayDoc?.calories || 0,
        activity: todayDoc?.activity || "Idle",
      },
      week: {
        steps: weekAgg[0]?.steps || 0,
        calories: weekAgg[0]?.calories || 0,
      },
      month: {
        steps: monthAgg[0]?.steps || 0,
        calories: monthAgg[0]?.calories || 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/data/:userId", async (req, res) => {
  try {
    const data = await Fitness.find({ userId: req.params.userId }).sort({ createdAt: 1 });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.listen(port, "0.0.0.0", () => console.log(`Server running on port ${port}`));
