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
  contest.status = "pending"; // default until admin approves
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

// Declare winner
app.post("/contests/:id/winner", async (req, res) => {
  await connectDB();
  const id = req.params.id;
  const { name, email, photo } = req.body;
  const result = await contestsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { winner: { name, email, photo } } }
  );
  res.json(result);
});

// Approve / Reject contest (Admin)
app.patch("/contests/:id/status", async (req, res) => {
  await connectDB();
  const id = req.params.id;
  const { status } = req.body; // "confirmed" or "rejected"
  const result = await contestsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status } }
  );
  res.json(result);
});

/* ---------------- USER ROUTES ---------------- */

// Add new user
app.post("/users", async (req, res) => {
  await connectDB();
  const user = req.body;
  const existing = await usersCollection.findOne({ email: user.email });
  if (existing) return res.json({ message: "User already exists" });

  user.role = "user"; // default role
  user.createdAt = new Date();
  const result = await usersCollection.insertOne(user);
  res.json({ insertedId: result.insertedId });
});

// Get all users
app.get("/users", async (req, res) => {
  await connectDB();
  const users = await usersCollection.find().toArray();
  res.json(users);
});

// Change user role
app.patch("/users/:id/role", async (req, res) => {
  await connectDB();
  const id = req.params.id;
  const { role } = req.body;
  const result = await usersCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { role } }
  );
  res.json(result);
});

/* ---------------- SUBMISSION ROUTES ---------------- */

// Submit task for a contest
app.post("/submissions", async (req, res) => {
  await connectDB();
  const submission = req.body;
  submission.submittedAt = new Date();
  const result = await submissionsCollection.insertOne(submission);
  res.json({ insertedId: result.insertedId });
});

// Get all submissions for a contest
app.get("/submissions/:contestId", async (req, res) => {
  await connectDB();
  const contestId = req.params.contestId;
  const submissions = await submissionsCollection
    .find({ contestId })
    .toArray();
  res.json(submissions);
});

app.listen(port, () => {
  console.log(`🚀 SkillSpire Contest Server running at http://localhost:${port}`);
});
