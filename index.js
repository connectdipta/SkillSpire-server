require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

/* ---------------- MIDDLEWARE ---------------- */
app.use(cors());
app.use(express.json());

/* ---------------- MONGODB CONNECTION ---------------- */
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;
let contestsCollection;
let usersCollection;
let submissionsCollection;

async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db("skillspireDB");
    contestsCollection = db.collection("contests");
    usersCollection = db.collection("users");
    submissionsCollection = db.collection("submissions");
    console.log("✅ Connected to MongoDB Atlas");
  }
}

/* ---------------- HEALTH CHECK ---------------- */
app.get("/", async (req, res) => {
  await connectDB();
  res.send("SkillSpire Contest Server API Running!");
});

/* ---------------- CONTEST ROUTES ---------------- */

/**
 * GET /contests
 * Query params:
 *  - search (string)
 *  - sort=participants
 *  - limit=number
 */
app.get("/contests", async (req, res) => {
  await connectDB();

  const { search, sort, limit } = req.query;

  let query = {};

  // 🔍 Search by contest name or type
  if (search) {
    query = {
      $or: [
        { name: { $regex: search, $options: "i" } },
        { type: { $regex: search, $options: "i" } },
      ],
    };
  }

  // 🔁 Create cursor
  let cursor = contestsCollection.find(query);

  // 🔥 Sort by highest participants
  if (sort === "participants") {
    cursor = cursor.sort({ participants: -1 });
  }

  // 📌 Limit result count
  if (limit) {
    cursor = cursor.limit(parseInt(limit));
  }

  const contests = await cursor.toArray();
  res.json(contests);
});

/* -------- Get single contest -------- */
app.get("/contests/:id", async (req, res) => {
  await connectDB();

  const contest = await contestsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });

  if (!contest) {
    return res.status(404).json({ error: "Contest not found" });
  }

  res.json(contest);
});

/* -------- Add new contest -------- */
app.post("/contests", async (req, res) => {
  await connectDB();

  const contest = req.body;

  contest.createdAt = new Date();
  contest.participants = contest.participants || 0;
  contest.status = "pending";

  const result = await contestsCollection.insertOne(contest);
  res.json({ insertedId: result.insertedId });
});

/* -------- Register contest (increase participants) -------- */
app.post("/contests/:id/register", async (req, res) => {
  await connectDB();

  const result = await contestsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $inc: { participants: 1 } }
  );

  res.json(result);
});

/* ---------------- USER ROUTES ---------------- */

/* -------- Add new user -------- */
app.post("/users", async (req, res) => {
  await connectDB();

  const user = req.body;

  const existing = await usersCollection.findOne({ email: user.email });
  if (existing) {
    return res.json({ message: "User already exists" });
  }

  user.role = "user";
  user.createdAt = new Date();

  const result = await usersCollection.insertOne(user);
  res.json({ insertedId: result.insertedId });
});

/* ---------------- SUBMISSION ROUTES ---------------- */

/* -------- Submit contest entry -------- */
app.post("/submissions", async (req, res) => {
  await connectDB();

  const submission = req.body;
  submission.submittedAt = new Date();

  const result = await submissionsCollection.insertOne(submission);
  res.json({ insertedId: result.insertedId });
});

/* -------- Get submissions for a contest -------- */
app.get("/submissions/:contestId", async (req, res) => {
  await connectDB();

  const submissions = await submissionsCollection
    .find({ contestId: req.params.contestId })
    .toArray();

  res.json(submissions);
});

/* ---------------- START SERVER ---------------- */
app.listen(port, () => {
  console.log(`🚀 SkillSpire Server running at http://localhost:${port}`);
});
