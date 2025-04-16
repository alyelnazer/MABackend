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

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ✅ Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ Multer (in-memory)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ User Schema & Model
const User = mongoose.model("User", new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  videos: { type: Number, default: 0 },
  followers: { type: Number, default: 0 },
  following: { type: Number, default: 0 },
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

    res.status(201).json({ token, user });
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

    res.json({ token, user });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

// ✅ Upload Video
app.post("/api/videos/upload", upload.single("video"), async (req, res) => {
  console.log("📥 Upload route hit");

  try {
    const { caption, songId, location } = req.body;
    if (!req.file) {
      console.error("❌ No video file uploaded");
      return res.status(400).json({ message: "No file uploaded" });
    }

    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "video" },
      (err, result) => {
        if (err) {
          console.error("❌ Cloudinary upload error:", err);
          return res.status(500).json({ message: "Upload failed", error: err });
        }

        console.log("✅ Upload success:", result.secure_url);
        res.status(200).json({
          message: "Upload successful",
          url: result.secure_url,
          public_id: result.public_id,
          metadata: { caption, songId, location },
        });
      }
    );

    streamifier.createReadStream(req.file.buffer).pipe(stream);
  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).json({ message: "Upload error", error: err });
  }
});

// ✅ Start Server
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
