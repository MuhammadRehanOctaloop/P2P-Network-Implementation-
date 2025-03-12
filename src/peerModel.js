import mongoose from "mongoose";

const PeerSchema = new mongoose.Schema({
  peerId: { type: String, required: true, unique: true },
  location: { type: String },
  latency: { type: Number },
  bandwidth: { type: String },
  multiaddrs: { type: [String] }, // Store multiaddrs as an array
  lastSeen: { type: Date, default: Date.now },
});

export const Peer = mongoose.model("Peer", PeerSchema);
