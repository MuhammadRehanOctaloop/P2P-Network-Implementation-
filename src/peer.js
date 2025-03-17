import { createLibp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { kadDHT } from "@libp2p/kad-dht";
import { identify } from "@libp2p/identify";
import { bootstrap } from "@libp2p/bootstrap";
import { pipe } from "it-pipe";
import { toString } from "uint8arrays/to-string";
import { Uint8ArrayList } from "uint8arraylist";
import readline from "readline";
import { circuitRelayServer } from "@libp2p/circuit-relay-v2";
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import os from "os";
import { performance } from "perf_hooks";
import net from "net";
import https from "https";
import { connectDB } from "./database.js"; // Import DB connection
import { Peer } from "./peerModel.js"; // Import the Peer model
import { ping } from "@libp2p/ping";
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { mplex } from '@libp2p/mplex';


await connectDB(); // Connect to MongoDB at startup

// Bootstrap peers
const bootstrapPeers = [
  "/ip4/192.168.18.65/tcp/15001/p2p/YOUR_PEER_ID", // Replace with actual Peer ID
];

const node = await createLibp2p({
  addresses: { listen: [
    '/ip4/0.0.0.0/tcp/0',
    '/webrtc', // ✅ Enable WebRTC transport
    '/webrtc-direct'
  ] },
  transports: [tcp(), webRTC(), webSockets(), circuitRelayTransport()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux(), mplex()],
  services: {
    dht: kadDHT({ protocol: "/ipfs/kad/1.0.0", clientMode: false }),
    identify: identify(),
    bootstrap: bootstrap({ list: bootstrapPeers }),
    ping: ping(),  // ✅ Enable ping service
    relay: circuitRelayServer({}),
  },
});

await node.start();
console.log("✅ Node started with ID:", node.peerId.toString());
console.log(
  "📡 Listening on:",
  node
    .getMultiaddrs()
    .map((ma) => ma.toString())
    .join("\n")
);

// Function to get system bandwidth and latency
async function getNodeStats() {
  return {
    location: await getLocation(), // Ideally use a geolocation API to fetch real location
    latency: await measureLatency(),
    bandwidth: await getNetworkBandwidth(),
  };
}

// for location

async function getLocation() {
  try {
    const res = await fetch("http://ip-api.com/json/");
    const data = await res.json();
    return `${data.city}, ${data.country}`;
  } catch (error) {
    console.error("❌ Failed to fetch location:", error);
    return "Unknown";
  }
}

async function measureLatency() {
  return new Promise((resolve, reject) => {
    const host = "192.168.18.65"; // Change this to the actual peer's IP

    // Extracting transport port dynamically
    const multiaddrs = node.getMultiaddrs(); 
    let port = null;

    for (const ma of multiaddrs) {
      const parts = ma.toString().split("/"); // Split the multiaddress into parts
      const portIndex = parts.indexOf("tcp") + 1;
      if (portIndex > 0 && portIndex < parts.length) {
        port = parseInt(parts[portIndex]); // Extract port after "tcp"
        break;
      }
    }

    if (!port) {
      console.error("❌ No valid TCP port found for the node.");
      return reject("Unknown");
    }

    console.log(`🌐 Measuring latency to ${host}:${port}`);

    const start = performance.now();
    const socket = new net.Socket();

    socket.connect(port, host, () => {
      const latency = performance.now() - start;
      socket.destroy();
      resolve(latency.toFixed(2));
    });

    socket.on("error", (err) => {
      console.error(`❌ Failed to connect to ${host}:${port}`, err);
      reject("Unknown");
    });
  });
}


// Simulate getting network bandwidth
function getNetworkBandwidth() {
  const networkInterfaces = os.networkInterfaces();
  let bandwidth = "Unknown";
  
  for (const key in networkInterfaces) {
    for (const net of networkInterfaces[key]) {
      if (!net.internal && net.family === "IPv4") {
        bandwidth = `${Math.floor(Math.random() * 100) + 10} Mbps`; // Simulated value
      }
    }
  }
  return bandwidth;
}



// Periodically announce mining availability
async function announceAvailability() {
  const stats = await getNodeStats(); // Fetch peer stats (location, latency, bandwidth)
  const multiaddrs = node.getMultiaddrs().map((ma) => ma.toString()); // Get multiaddrs
  
  console.log(`📢 Announcing miner availability:`, stats, { multiaddrs });
  
  try {
    // Check if the peer already exists in the DB
    const existingPeer = await Peer.findOne({ peerId: node.peerId.toString() });
    
    if (existingPeer) {
      // Update the peer data
      existingPeer.location = stats.location;
      existingPeer.latency = stats.latency;
      existingPeer.bandwidth = stats.bandwidth;
      existingPeer.multiaddrs = multiaddrs; // Store multiaddrs
      existingPeer.lastSeen = new Date();
      await existingPeer.save();
      console.log("🔄 Updated peer information in the database.");
    } else {
      // Insert new peer entry
      await Peer.create({
        peerId: node.peerId.toString(),
        location: stats.location,
        latency: stats.latency,
        bandwidth: stats.bandwidth,
        multiaddrs: multiaddrs, // Store multiaddrs
        lastSeen: new Date(),
      });
      console.log("✅ Peer added to the database.");
    }
  } catch (error) {
    console.error("❌ Error saving peer to the database:", error);
  }

  setTimeout(announceAvailability, 60000); // Run every 60 seconds
}


announceAvailability(); // Run at startup

setInterval(async () => {
  console.log("📡 Announcing peer in DHT...");
  for (const addr of node.getMultiaddrs()) {
    await node.services.dht.provide(addr);
  }
}, 30000);



// Handle incoming messages
node.handle("/chat/1.0.0", async ({ stream, connection }) => {
  try {
    const senderPeerId = connection.remotePeer.toString();
    await pipe(stream.source, async function (source) {
      for await (let chunk of source) {
        if (chunk instanceof Uint8ArrayList) {
          chunk = chunk.subarray();
        }
        const message = toString(chunk);
        console.log("📨 Incoming message detected");
        console.log(`💬 Received message from [${senderPeerId}]:`, message);
      }
    });
  } catch (error) {
    console.error("❌ Error reading message:", error);
  }
});

// Discover peers
node.addEventListener("peer:discovery", async (evt) => {
  console.log(`🔍 Discovered peer: ${evt.detail.id.toString()}`);
});

// Function to remove inactive peers and log them before deletion
async function removeInactivePeers() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

  try {
    // Find inactive peers
    const inactivePeers = await Peer.find({ lastSeen: { $lt: fiveMinutesAgo } });

    if (inactivePeers.length > 0) {
      console.log(`⚠️ Found ${inactivePeers.length} inactive peers. Logging before removal...`);
      
      inactivePeers.forEach((peer) => {
        console.log(`🛑 Removing Peer: ${peer.peerId} (Last Seen: ${peer.lastSeen})`);
      });

      // (Optional) Store removed peers in a separate collection
      // await RemovedPeer.insertMany(inactivePeers);

      // Remove inactive peers
      const removedPeers = await Peer.deleteMany({ lastSeen: { $lt: fiveMinutesAgo } });
      console.log(`🗑️ Successfully removed ${removedPeers.deletedCount} inactive peers.`);
    } else {
      console.log("✅ No inactive peers found.");
    }
  } catch (error) {
    console.error("❌ Error removing inactive peers:", error);
  }

  setTimeout(removeInactivePeers, 5 * 60 * 1000); // Run every 5 minutes
}

// Start cleanup process
removeInactivePeers();


// Interactive chat input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
async function sendMessage(targetPeerId) {
  try {
    const stream = await node.dialProtocol(targetPeerId, "/chat/1.0.0");
    rl.question("Enter message: ", async (message) => {
      await pipe([Buffer.from(message)], stream.sink);
      console.log("📨 Message sent!");
      sendMessage(targetPeerId);
    });
  } catch (err) {
    console.error("❌ Failed to send message:", err);
  }
}
