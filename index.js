require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

/* ================= MIDDLEWARE ================= */
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

/* ================= DB ================= */
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db, usersCollection, contestsCollection, submissionsCollection, paymentsCollection;

async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db("skillspireDB");
    usersCollection = db.collection("users");
    contestsCollection = db.collection("contests");
    submissionsCollection = db.collection("submissions");
    paymentsCollection = db.collection("payments");
    console.log("✅ MongoDB Connected");
  }
}

/* ================= AUTH ================= */
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: "Unauthorized" });
    req.user = decoded;
    next();
  });
};

const verifyAdmin = async (req, res, next) => {
  await connectDB();
  const user = await usersCollection.findOne({ email: req.user.email });
  if (user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};

/* ================= HEALTH ================= */
app.get("/", (req, res) => {
  res.send("SkillSpire API Running");
});

/* ================= JWT ================= */
app.post("/jwt", async (req, res) => {
  try {
    await connectDB();

    const { email, name, photo } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    let user = await usersCollection.findOne({ email });

    if (!user) {
      // First-time login (Google or Email)
      user = {
        email,
        name: name || "",
        photo: photo || "",
        role: "user",
        createdAt: new Date(),
        participatedContests: [],
        wonContests: [],
      };
      await usersCollection.insertOne(user);
    } else {
      // Existing user → update missing Google profile data
      if (!user.name || !user.photo) {
        await usersCollection.updateOne(
          { email },
          {
            $set: {
              name: name || user.name || "",
              photo: photo || user.photo || "",
            },
          }
        );
      }
    }

    const token = jwt.sign(
      { email: user.email, role: user.role },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "3h" }
    );

    // Cookie (localhost-safe)
    res.cookie("token", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
    });

    res.json({ success: true, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "JWT failed" });
  }
});


/* ================= USERS ================= */
app.post("/users", async (req, res) => {
  await connectDB();
  const exists = await usersCollection.findOne({ email: req.body.email });
  if (exists) return res.json({ success: true });

  await usersCollection.insertOne({
    ...req.body,
    role: "user",
    createdAt: new Date(),
    participatedContests: [],
    wonContests: [],
  });

  res.json({ success: true });
});

app.get("/users/me", verifyToken, async (req, res) => {
  await connectDB();
  const user = await usersCollection.findOne(
    { email: req.user.email },
    {
      projection: {
        name: 1,
        email: 1,
        photo: 1,
        role: 1,
        bio: 1,
        participatedContests: 1,
        wonContests: 1,
      },
    }
  );
  res.json(user);
});

app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
  await connectDB();
  res.json(await usersCollection.find().toArray());
});

app.patch("/users/role/:email", verifyToken, verifyAdmin, async (req, res) => {
  await connectDB();
  res.json(
    await usersCollection.updateOne(
      { email: req.params.email },
      { $set: { role: req.body.role } }
    )
  );
});

/* ================= UPDATE USER PROFILE ================= */
app.patch("/users/profile/:email", verifyToken, async (req, res) => {
  await connectDB();

  const { email } = req.params;

  // security: user can update ONLY own profile
  if (req.user.email !== email) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { name, photo, bio } = req.body;

  const result = await usersCollection.updateOne(
    { email },
    {
      $set: {
        name,
        photo,
        bio,
        updatedAt: new Date(),
      },
    }
  );

  res.json({ success: true, result });
});


/* ================= CONTESTS ================= */
/* PUBLIC & CREATOR: Get contests (WITH submissionsCount) */
app.get("/contests", async (req, res) => {
  await connectDB();

  const { search, sort, limit, creatorEmail } = req.query;

  let matchStage = {};

  /* ================= PUBLIC VIEW ================= */
  if (!creatorEmail) {
    matchStage.status = { $in: ["confirmed", "ended"] };
  }

  /* ================= CREATOR DASHBOARD ================= */
  if (creatorEmail) {
    matchStage.creatorEmail = creatorEmail;
  }

  /* ================= SEARCH ================= */
  if (search) {
    matchStage.$or = [
      { name: { $regex: search, $options: "i" } },
      { type: { $regex: search, $options: "i" } },
    ];
  }

  const pipeline = [
    { $match: matchStage },

    /* COUNT SUBMISSIONS */
    {
      $lookup: {
        from: "submissions",
        localField: "_id",
        foreignField: "contestId",
        as: "submissions",
      },
    },
    {
      $addFields: {
        submissionsCount: { $size: "$submissions" },
      },
    },

    /* optional cleanup */
    {
      $project: {
        submissions: 0,
      },
    },
  ];

  /* ================= SORT ================= */
  if (sort === "participants") {
    pipeline.push({ $sort: { participants: -1 } });
  }

  /* ================= LIMIT ================= */
  if (limit) {
    pipeline.push({ $limit: Number(limit) });
  }

  const contests = await contestsCollection.aggregate(pipeline).toArray();

  res.json(contests);
});

/* PUBLIC: Single contest details */
app.get("/contests/:id", async (req, res) => {
  await connectDB();

  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid contest ID" });
  }

  const contest = await contestsCollection.findOne({
    _id: new ObjectId(id),
  });

  if (!contest) {
    return res.status(404).json({ message: "Contest not found" });
  }

  res.json(contest);
});

/* CREATOR: Create contest */
app.post("/contests", verifyToken, async (req, res) => {
  await connectDB();

  const contest = {
    ...req.body,
    creatorEmail: req.user.email,
    participants: 0,
    status: "pending",
    createdAt: new Date(),
  };

  const result = await contestsCollection.insertOne(contest);
  res.json(result);
});


/* CREATOR: Update contest (ONLY pending) */
app.put("/contests/:id", verifyToken, async (req, res) => {
  await connectDB();

  const contest = await contestsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });

  if (!contest) {
    return res.status(404).json({ message: "Contest not found" });
  }

  // only creator + pending
  if (
    contest.creatorEmail !== req.user.email ||
    contest.status !== "pending"
  ) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const result = await contestsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    {
      $set: {
        ...req.body,
        updatedAt: new Date(),
      },
    }
  );

  res.json(result);
});

/* CREATOR: Delete contest (ONLY pending) */
app.delete("/contests/:id", verifyToken, async (req, res) => {
  await connectDB();

  const contest = await contestsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });

  if (!contest) {
    return res.status(404).json({ message: "Contest not found" });
  }

  if (
    contest.creatorEmail !== req.user.email ||
    contest.status !== "pending"
  ) {
    return res.status(403).json({ message: "Forbidden" });
  }

  await contestsCollection.deleteOne({
    _id: new ObjectId(req.params.id),
  });

  res.json({ success: true });
});

// Admin: get ALL contests
app.get("/admin/contests", verifyToken, verifyAdmin, async (req, res) => {
  await connectDB();
  res.json(await contestsCollection.find().toArray());
});

// Admin: update contest status
app.patch("/admin/contests/:id/status", verifyToken, verifyAdmin, async (req, res) => {
  await connectDB();
  const { status } = req.body;

  if (!["confirmed", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const result = await contestsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { status } }
  );

  res.json(result);
});

// Admin: delete contest
app.delete("/admin/contests/:id", verifyToken, verifyAdmin, async (req, res) => {
  await connectDB();
  await contestsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ success: true });
});



/* ================= PAYMENTS ================= */
app.post("/payments", verifyToken, async (req, res) => {
  try {
    await connectDB();

    const { contestId, amount } = req.body;
    const email = req.user.email;

    // Validation
    if (!contestId || amount === undefined) {
      return res.status(400).json({ message: "Missing payment data" });
    }

    // Prevent duplicate payment
    const alreadyPaid = await paymentsCollection.findOne({
      contestId: new ObjectId(contestId),
      email: email,
    });

    if (alreadyPaid) {
      return res.status(400).json({ message: "Already registered" });
    }

    // Save payment
    await paymentsCollection.insertOne({
      contestId: new ObjectId(contestId),
      email,
      amount,
      createdAt: new Date(),
    });

    // Increase participant count
    await contestsCollection.updateOne(
      { _id: new ObjectId(contestId) },
      { $inc: { participants: 1 } }
    );

    // Track user participation
    await usersCollection.updateOne(
      { email },
      { $addToSet: { participatedContests: new ObjectId(contestId) } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Payment Error:", error);
    res.status(500).json({ message: "Payment processing failed" });
  }
});


/* ================= SUBMISSIONS ================= */
app.post("/submissions", verifyToken, async (req, res) => {
  await connectDB();
  const { contestId, content } = req.body;
  const email = req.user.email;

  if (!contestId || !content) {
    return res.status(400).json({ message: "Missing submission data" });
  }

  const submission = {
    contestId: new ObjectId(contestId),
    userEmail: email,
    content,
    submittedAt: new Date(),
    isWinner: false,
  };

  res.json(await submissionsCollection.insertOne(submission));
});

app.get("/submissions", verifyToken, async (req, res) => {
  await connectDB();
  const { contestId } = req.query;

  if (!ObjectId.isValid(contestId)) return res.json([]);

  // JOIN with Users collection to get Name and Photo dynamically
  const submissions = await submissionsCollection.aggregate([
    { $match: { contestId: new ObjectId(contestId) } },
    {
      $lookup: {
        from: "users",
        localField: "userEmail",
        foreignField: "email",
        as: "author"
      }
    },
    { $unwind: { path: "$author", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        userName: "$author.name",
        userPhoto: "$author.photo"
      }
    },
    { $project: { author: 0 } }
  ]).toArray();

  res.json(submissions);
});


/* ================= LEADERBOARD ================= */
app.get("/leaderboard", async (req, res) => {
  await connectDB();

  const users = await usersCollection
    .find({
      $expr: { $gt: [{ $size: "$wonContests" }, 0] }
    })
    .toArray();

  res.json(
    users
      .map(u => ({
        name: u.name || "Anonymous",
        photo: u.photo || "",
        email: u.email,
        wins: u.wonContests.length,
      }))
      .sort((a, b) => b.wins - a.wins)
  );
});


/* ================= WINNERS ================= */
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
        name: user.name || "Winner",
        photo: user.photo || "",
        contest: contest.name,
        prize: contest.prize,
      });
    }
  }

  res.json(result);
});

/* ================= DECLARE WINNER ================= */
app.patch("/submissions/:id/winner", verifyToken, async (req, res) => {
  await connectDB();
  const submissionId = req.params.id;

  const submission = await submissionsCollection.findOne({ _id: new ObjectId(submissionId) });
  if (!submission) return res.status(404).json({ message: "Submission not found" });

  const contestId = new ObjectId(submission.contestId);
  const contest = await contestsCollection.findOne({ _id: contestId });

  // Only creator can declare winner
  if (contest.creatorEmail !== req.user.email) return res.status(403).json({ message: "Forbidden" });

  // Prevent multiple winners for the same contest
  const alreadyWinner = await submissionsCollection.findOne({ contestId, isWinner: true });
  if (alreadyWinner) return res.status(400).json({ message: "Winner already declared" });

  // 1. Mark this submission as winner
  await submissionsCollection.updateOne({ _id: new ObjectId(submissionId) }, { $set: { isWinner: true } });

  // 2. Add contest to user's wonContests array
  await usersCollection.updateOne(
    { email: submission.userEmail },
    { $addToSet: { wonContests: contestId } }
  );

  const winnerUser = await usersCollection.findOne({ email: submission.userEmail });

  // 3. Close the contest and store winner summary
  await contestsCollection.updateOne(
    { _id: contestId },
    {
      $set: {
        status: "ended",
        winner: {
          name: winnerUser?.name || "Winner",
          email: winnerUser?.email,
          photo: winnerUser?.photo || ""
        }
      }
    }
  );

  res.json({ success: true });
});


/* ================= SERVER ================= */
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
