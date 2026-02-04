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

let db;
let contestsCollection;
let usersCollection;
let submissionsCollection;
let paymentsCollection;

async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db("skillspireDB");

    contestsCollection = db.collection("contests");
    usersCollection = db.collection("users");
    submissionsCollection = db.collection("submissions");
    paymentsCollection = db.collection("payments");

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

app.get("/contests", async (req, res) => {
  await connectDB();
  const { search, sort, limit, creatorEmail, status } = req.query;

  // ONLY APPROVED CONTESTS
  let query = { status: "confirmed" }; 

  // Creator dashboard override
  if (creatorEmail) {
    query = { creatorEmail }; // creators see their own contests
  }

  // Admin override
  if (status) {
    query = { status }; // admin can filter pending / rejected
  }

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { type: { $regex: search, $options: "i" } },
    ];
  }

  let cursor = contestsCollection.find(query);

  if (sort === "participants") cursor = cursor.sort({ participants: -1 });
  if (limit) cursor = cursor.limit(Number(limit));

  res.json(await cursor.toArray());
});


app.get("/contests/:id", async (req, res) => {
  await connectDB();
  const contest = await contestsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });
  if (!contest) return res.status(404).json({ message: "Contest not found" });
  res.json(contest);
});

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

app.put("/contests/:id", async (req, res) => {
  await connectDB();

  const contest = await contestsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });

  if (!contest || contest.status !== "pending") {
    return res.status(403).json({ message: "Edit not allowed" });
  }

  const result = await contestsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );

  res.json(result);
});

app.patch("/contests/status/:id", async (req, res) => {
  await connectDB();
  const result = await contestsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { status: req.body.status } }
  );
  res.json(result);
});

app.delete("/contests/:id", async (req, res) => {
  await connectDB();
  res.json(
    await contestsCollection.deleteOne({ _id: new ObjectId(req.params.id) })
  );
});

/* =====================================================
   ===================== PAYMENTS ======================
   ===================================================== */

/**
 * After successful payment:
 * 1. Save payment
 * 2. Increase participants
 * 3. Register user to contest
 */
app.post("/payments", async (req, res) => {
  await connectDB();

  const { contestId, email, amount } = req.body;

  if (!contestId || !email || !amount) {
    return res.status(400).json({ message: "Missing payment data" });
  }

  // Prevent duplicate payment
  const exists = await paymentsCollection.findOne({ contestId, email });
  if (exists) {
    return res.status(400).json({ message: "Already paid for this contest" });
  }

  // Save payment
  await paymentsCollection.insertOne({
    contestId,
    email,
    amount,
    createdAt: new Date(),
  });

  // ncrease participants
  await contestsCollection.updateOne(
    { _id: new ObjectId(contestId) },
    { $inc: { participants: 1 } }
  );

  // Register user
  await usersCollection.updateOne(
    { email },
    { $addToSet: { participatedContests: contestId } }
  );

  res.json({ success: true });
});

/* =====================================================
   ===================== USERS =========================
   ===================================================== */

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

app.get("/users", async (req, res) => {
  await connectDB();
  res.json(await usersCollection.find().toArray());
});

app.get("/users/role/:email", async (req, res) => {
  await connectDB();
  const user = await usersCollection.findOne({ email: req.params.email });
  res.json({ role: user?.role || "user" });
});

app.patch("/users/role/:email", async (req, res) => {
  await connectDB();
  res.json(
    await usersCollection.updateOne(
      { email: req.params.email },
      { $set: { role: req.body.role } }
    )
  );
});

/* ================= UPDATE USER PROFILE ================= */
app.patch("/users/profile/:email", async (req, res) => {
  await connectDB();

  const { name, photo, bio } = req.body;

  const result = await usersCollection.updateOne(
    { email: req.params.email },
    {
      $set: {
        name,
        photo,
        bio,
        updatedAt: new Date(),
      },
    }
  );

  res.json(result);
});


/* =====================================================
   =================== SUBMISSIONS =====================
   ===================================================== */

app.post("/submissions", async (req, res) => {
  await connectDB();
  const submission = {
    ...req.body,
    submittedAt: new Date(),
    isWinner: false,
  };
  res.json(await submissionsCollection.insertOne(submission));
});

app.get("/submissions/:contestId", async (req, res) => {
  await connectDB();
  res.json(
    await submissionsCollection
      .find({ contestId: req.params.contestId })
      .toArray()
  );
});

app.patch("/submissions/winner/:id", async (req, res) => {
  await connectDB();

  const submission = await submissionsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });

  if (!submission) {
    return res.status(404).json({ message: "Submission not found" });
  }

  await submissionsCollection.updateMany(
    { contestId: submission.contestId },
    { $set: { isWinner: false } }
  );

  await submissionsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { isWinner: true } }
  );

  await usersCollection.updateOne(
    { email: submission.userEmail },
    { $addToSet: { wonContests: submission.contestId } }
  );

  res.json({ success: true });
});

app.get("/users/participated/:email", async (req, res) => {
  await connectDB();

  const user = await usersCollection.findOne({
    email: req.params.email,
  });

  res.json(user?.participatedContests || []);
});

app.get("/users/won/:email", async (req, res) => {
  await connectDB();

  const user = await usersCollection.findOne({
    email: req.params.email,
  });

  res.json(user?.wonContests || []);
});

/* =====================================================
   =================== WINNERS API =====================
   ===================================================== */

app.get("/winners", async (req, res) => {
  await connectDB();

  const winners = await submissionsCollection
    .find({ isWinner: true })
    .sort({ submittedAt: -1 })
    .limit(6)
    .toArray();

  const result = [];

  for (const win of winners) {
    const user = await usersCollection.findOne({ email: win.userEmail });
    const contest = await contestsCollection.findOne({
      _id: new ObjectId(win.contestId),
    });

    if (user && contest) {
      result.push({
        name: user.name || user.displayName || "Winner",
        photo: user.photo || user.photoURL || "",
        contest: contest.name,
        prize: contest.prize,
      });
    }
  }

  res.json(result);
});

/* =====================================================
   =================== LEADERBOARD =====================
   ===================================================== */

app.get("/leaderboard", async (req, res) => {
  await connectDB();

  const users = await usersCollection
    .find({ wonContests: { $exists: true, $ne: [] } })
    .project({
      name: 1,
      photo: 1,
      email: 1,
      wonContests: 1,
    })
    .toArray();

  const leaderboard = users
    .map(user => ({
      name: user.name || "Anonymous",
      photo: user.photo || "",
      email: user.email,
      wins: user.wonContests.length,
    }))
    .sort((a, b) => b.wins - a.wins);

  res.json(leaderboard);
});


/* ================= SERVER ================= */
app.listen(port, () =>
  console.log(`🚀 Server running on http://localhost:${port}`)
);
