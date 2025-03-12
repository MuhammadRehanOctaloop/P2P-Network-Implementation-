import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from the correct location
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const MONGO_URI = process.env.MONGO_URI;

export async function connectDB() {
  if (!MONGO_URI) {
    console.error("❌ MongoDB URI is missing in environment variables.");
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    throw new Error("Database connection failed");
  }
}

// // Call the function
// connectDB();
