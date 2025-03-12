import mongoose from "mongoose";

const peerSchema = new mongoose.Schema({
  peerId: { type: String, required: true, unique: true },
  location: { type: String, required: true },
  latency: { type: Number, required: true },
  bandwidth: { type: String, required: true },
  lastSeen: { type: Date, default: Date.now },
});

export const Peer = mongoose.model("Peer", peerSchema);
