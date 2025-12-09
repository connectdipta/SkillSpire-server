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
    deprecationErrors: true
  }
});

let db;
let contestsCollection;

async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db("skillspireDB");
    contestsCollection = db.collection("contests");
    console.log("✅ Connected to MongoDB Atlas");
  }
  return db;
}

/* ---------------- HEALTH CHECK ---------------- */
app.get("/", async (req, res) => {
  await connectDB();
  res.send("SkillSpire Contest Server API Running!");
});

/* ---------------- CONTEST ROUTES ---------------- */

// Get all contests
app.get("/contests", async (req, res) => {
  await connectDB();
  const contests = await contestsCollection.find().toArray();
  res.json(contests);
});

// Get single contest by ID
app.get("/contests/:id", async (req, res) => {
  await connectDB();
  const id = req.params.id;
  const contest = await contestsCollection.findOne({ _id: new ObjectId(id) });
  if (!contest) {
    return res.status(404).json({ error: "Contest not found" });
  }
  res.json(contest);
});

// Add new contest
app.post("/contests", async (req, res) => {
  await connectDB();
  const contest = req.body;
  contest.createdAt = new Date();
  contest.participants = 0; // default count
  const result = await contestsCollection.insertOne(contest);
  res.json({ insertedId: result.insertedId });
});

// Update contest
app.put("/contests/:id", async (req, res) => {
  await connectDB();
  const id = req.params.id;
  const updatedContest = req.body;
  const result = await contestsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updatedContest }
  );
  res.json(result);
});

// Delete contest
app.delete("/contests/:id", async (req, res) => {
  await connectDB();
  const id = req.params.id;
  const result = await contestsCollection.deleteOne({ _id: new ObjectId(id) });
  res.json(result);
});

// Register user (increase participants count)
app.post("/contests/:id/register", async (req, res) => {
  await connectDB();
  const id = req.params.id;
  const result = await contestsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $inc: { participants: 1 } }
  );
  res.json(result);
});

app.listen(port, () => {
  console.log(`🚀 SkillSpire Contest Server running at http://localhost:${port}`);
});
