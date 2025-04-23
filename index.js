const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

// ✅ MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ✅ Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ Multer setup
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ Mongoose models
const User = mongoose.model("User", new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  videos: { type: Number, default: 0 },
  followers: { type: Number, default: 0 },
  following: { type: Number, default: 0 },
}));

const Video = mongoose.model("Video", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  url: String,
  public_id: String,
  caption: String,
  songId: String,
  location: String,
  uploadedAt: { type: Date, default: Date.now },
}));

// ✅ Register
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password: hashed });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || "secret", { expiresIn: "24h" });

    res.status(201).json({ token, user: { ...user.toObject(), id: user._id } });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Registration failed" });
  }
});

// ✅ Login
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: "User not found" });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ message: "Invalid password" });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || "secret", { expiresIn: "24h" });

    res.json({ token, user: { ...user.toObject(), id: user._id } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

// ✅ Upload video
app.post("/api/videos/upload", upload.single("video"), async (req, res) => {
  try {
    const { caption, songId, location, userId } = req.body;
    if (!req.file || !userId) {
      return res.status(400).json({ message: "Missing video file or user ID" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "video" },
      async (err, result) => {
        if (err) {
          console.error("❌ Cloudinary upload error:", err);
          return res.status(500).json({ message: "Upload failed", error: err });
        }

        const video = await Video.create({
          userId,
          url: result.secure_url,
          public_id: result.public_id,
          caption,
          songId,
          location,
        });

        res.status(200).json({ message: "Upload successful", video });
      }
    );

    streamifier.createReadStream(req.file.buffer).pipe(stream);
  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).json({ message: "Upload error", error: err });
  }
});

// ✅ Get all videos
app.get("/api/videos", async (req, res) => {
  try {
    const videos = await Video.find().sort({ uploadedAt: -1 });
    res.status(200).json(videos);
  } catch (err) {
    console.error("❌ Error fetching videos:", err);
    res.status(500).json({ message: "Failed to fetch videos" });
  }
});

// ✅ ✅ ✅ FIXED: Get videos by user
app.get("/api/users/:userId/videos", async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "Invalid user ID format" });
  }

  try {
    const videos = await Video.find({ userId }).sort({ uploadedAt: -1 });
    res.status(200).json(videos);
  } catch (err) {
    console.error("❌ Error fetching user videos:", err);
    res.status(500).json({ message: "Failed to fetch user's videos" });
  }
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
