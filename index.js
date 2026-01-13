require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());

/* ================= DB CONNECTION ================= */
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db, contestsCollection, usersCollection, submissionsCollection;

async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db("skillspireDB");
    contestsCollection = db.collection("contests");
    usersCollection = db.collection("users");
    submissionsCollection = db.collection("submissions");
    console.log("✅ MongoDB Connected");
  }
}

/* ================= HEALTH ================= */
app.get("/", async (req, res) => {
  await connectDB();
  res.send("SkillSpire API Running");
});

/* =====================================================
   ===================== CONTESTS ======================
   ===================================================== */

/* Get contests */
app.get("/contests", async (req, res) => {
  await connectDB();
  const { search, sort, limit, creatorEmail, status } = req.query;
  let query = {};

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { type: { $regex: search, $options: "i" } },
    ];
  }

  if (creatorEmail) query.creatorEmail = creatorEmail;
  if (status) query.status = status;

  let cursor = contestsCollection.find(query);
  if (sort === "participants") cursor = cursor.sort({ participants: -1 });
  if (limit) cursor = cursor.limit(Number(limit));

  res.json(await cursor.toArray());
});

/* Get single contest */
app.get("/contests/:id", async (req, res) => {
  await connectDB();
  const contest = await contestsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });
  res.json(contest);
});

/* Add contest (Creator) */
app.post("/contests", async (req, res) => {
  await connectDB();
  const contest = {
    ...req.body,
    participants: 0,
    status: "pending",
    createdAt: new Date(),
  };
  const result = await contestsCollection.insertOne(contest);
  res.json(result);
});

/* Edit contest (only pending) */
app.put("/contests/:id", async (req, res) => {
  await connectDB();
  const contest = await contestsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });

  if (contest.status !== "pending") {
    return res.status(403).json({ message: "Edit not allowed" });
  }

  const result = await contestsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );
  res.json(result);
});

/* Admin: approve / reject */
app.patch("/contests/status/:id", async (req, res) => {
  await connectDB();
  const result = await contestsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { status: req.body.status } }
  );
  res.json(result);
});

/* Delete contest */
app.delete("/contests/:id", async (req, res) => {
  await connectDB();
  res.json(
    await contestsCollection.deleteOne({ _id: new ObjectId(req.params.id) })
  );
});

/* Join contest */
app.post("/contests/:id/register", async (req, res) => {
  await connectDB();

  const { email } = req.body;

  await contestsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $inc: { participants: 1 } }
  );

  await usersCollection.updateOne(
    { email },
    { $addToSet: { participatedContests: req.params.id } }
  );

  res.json({ success: true });
});

/* =====================================================
   ===================== USERS =========================
   ===================================================== */

/* Save user */
app.post("/users", async (req, res) => {
  await connectDB();
  const user = req.body;

  const exists = await usersCollection.findOne({ email: user.email });
  if (exists) return res.json({ message: "User exists" });

  user.role = "user";
  user.createdAt = new Date();
  user.participatedContests = [];
  user.wonContests = [];

  res.json(await usersCollection.insertOne(user));
});

/* Get all users (Admin) */
app.get("/users", async (req, res) => {
  await connectDB();
  res.json(await usersCollection.find().toArray());
});

/* Get role */
app.get("/users/role/:email", async (req, res) => {
  await connectDB();
  const user = await usersCollection.findOne({ email: req.params.email });
  res.json({ role: user?.role || "user" });
});

/* Update role (Admin) */
app.patch("/users/role/:email", async (req, res) => {
  await connectDB();
  res.json(
    await usersCollection.updateOne(
      { email: req.params.email },
      { $set: { role: req.body.role } }
    )
  );
});

/* =====================================================
   =================== SUBMISSIONS =====================
   ===================================================== */

/* Submit task */
app.post("/submissions", async (req, res) => {
  await connectDB();
  const submission = {
    ...req.body,
    submittedAt: new Date(),
    isWinner: false,
  };
  res.json(await submissionsCollection.insertOne(submission));
});

/* Get submissions by contest */
app.get("/submissions/:contestId", async (req, res) => {
  await connectDB();
  res.json(
    await submissionsCollection
      .find({ contestId: req.params.contestId })
      .toArray()
  );
});

/* Declare winner (Creator – only one) */
app.patch("/submissions/winner/:id", async (req, res) => {
  await connectDB();

  const submission = await submissionsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });

  // reset previous winners
  await submissionsCollection.updateMany(
    { contestId: submission.contestId },
    { $set: { isWinner: false } }
  );

  // set winner
  await submissionsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { isWinner: true } }
  );

  // save to user
  await usersCollection.updateOne(
    { email: submission.userEmail },
    { $addToSet: { wonContests: submission.contestId } }
  );

  res.json({ success: true });
});

/* =====================================================
   =================== SERVER ==========================
   ===================================================== */

app.listen(port, () =>
  console.log(`🚀 Server running on http://localhost:${port}`)
);
