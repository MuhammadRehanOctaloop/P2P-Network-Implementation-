import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { kadDHT } from '@libp2p/kad-dht'
import { identify } from '@libp2p/identify'
import { bootstrap } from '@libp2p/bootstrap'
import { pipe } from 'it-pipe'
import { fromString } from 'uint8arrays/from-string'
import readline from 'readline'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { connectDB } from "./database.js";
import { Peer } from "./peerModel.js";
import { peerIdFromString } from '@libp2p/peer-id'
import { ping } from "@libp2p/ping";

await connectDB();

// ✅ Fetch bootstrap peers from the database (Filter nulls)
async function getBootstrapPeers() {
  try {
    const peers = await Peer.find({}, { multiaddrs: 1, _id: 0 });
    return peers.flatMap(peer => peer.multiaddrs).filter(addr => addr);
  } catch (error) {
    console.error("❌ Error fetching bootstrap peers:", error);
    return [];
  }
}

const bootstrapPeers = await getBootstrapPeers();
console.log("🔗 Bootstrap Peers:", bootstrapPeers);

// ✅ Initialize libp2p node
const node = await createLibp2p({
  addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
  transports: [tcp(), circuitRelayTransport()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: {
    dht: kadDHT({ protocol: '/ipfs/kad/1.0.0', clientMode: true }),
    identify: identify(),
    bootstrap: bootstrap({ list: bootstrapPeers }),
    ping: ping(),  // ✅ Enable ping service
  },
  relay: {
    enabled: true,
    hop: {
      enabled: true,
      active: true,
    },
  },
});

await node.start();
console.log('✅ Node started with ID:', node.peerId.toString());
console.log('📡 Listening on:', node.getMultiaddrs().map(ma => ma.toString()).join('\n'));

async function pingPeer(peer) {
  return new Promise(async (resolve) => {
    const start = Date.now();
    try {
      const peerId = peerIdFromString(peer.peerId);
      const connection = await node.dial(peerId); // ✅ Establish a connection
      await node.services.ping.ping(peerId); // ✅ Use libp2p's ping service
      const latency = Date.now() - start;
      console.log(`⏱️ Pinged ${peer.peerId}: ${latency}ms`);
      resolve({ ...peer, latency });
    } catch (error) {
      console.error(`❌ Ping failed for ${peer.peerId}:`, error);
      resolve(null); // Mark as unreachable
    }
  });
}


async function getBestPeer() {
  try {
    const peers = await Peer.find().select("peerId multiaddrs -_id"); // ✅ Fetch all peers

    if (!peers.length) {
      console.log("⚠️ No available peers.");
      return null;
    }

    console.log("🔍 Pinging peers to determine the best one...");
    const pingResults = await Promise.all(peers.map(pingPeer));

    // Filter out unreachable peers and select the lowest-latency peer
    const bestPeer = pingResults
      .filter(peer => peer !== null) // Remove failed peers
      .sort((a, b) => a.latency - b.latency)[0]; // Sort by lowest latency
      console.log(bestPeer)

    if (!bestPeer) {
      console.log("❌ No reachable peers found.");
      return null;
    }

    console.log(`🏆 Best peer selected: ${bestPeer._doc.peerId} (Latency: ${bestPeer.latency}ms)`);
    return bestPeer;
  } catch (error) {
    console.error("❌ Error finding the best peer:", error);
    return null;
  }
}

// ✅ Interactive chat input setup
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// ✅ Connect to the best peer & start chat
// ✅ Reconnection with Exponential Backoff
async function connectToBestPeer(retryCount = 0) {
  const bestPeer = await getBestPeer();
  try {
    const peerId = peerIdFromString(bestPeer._doc.peerId);
    const stream = await node.dialProtocol(peerId, "/chat/1.0.0");
    console.log(`✅ Connected to Best Peer: ${peerId} (Latency: ${bestPeer.latency}ms)`);
    
    startChatSession(stream);
    return; // Exit function after a successful connection
  } catch (err) {
    console.error(`❌ Failed to connect to ${peerId}:`, err);
    
    // Implement exponential backoff (Retry after increasing delay)
    const delay = Math.min(5000 * (2 ** retryCount), 60000); // Max delay 60s
    console.log(`🔄 Retrying in ${delay / 1000} seconds...`);
    
    setTimeout(() => connectToBestPeer(retryCount + 1), delay);
  }
}

// ✅ Continuous Chat Session (No Recursive Calls)
function startChatSession(stream) {
  console.log(`💬 Chat started. Type your message:`);

  rl.on('line', async (message) => {
    try {
      if (stream && !stream.sink.ended) {
        await pipe([fromString(message)], stream.sink);
        console.log('📨 Message sent!');
      } else {
        console.log('⚠️ Stream closed. Reconnecting...');
        await connectToBestPeer(); // Reconnect if stream is closed
      }
    } catch (err) {
      console.error('❌ Failed to send message:', err);
    }
  });

  // ✅ Keep listening for messages
  receiveMessages(stream);
}


// ✅ Receive Incoming Messages
async function receiveMessages(stream) {
  try {
    await pipe(
      stream.source,
      async function (source) {
        for await (const msg of source) {
          console.log(`📩 Received: ${Buffer.from(msg).toString()}`);
        }
      }
    );
  } catch (err) {
    console.error('❌ Error receiving messages:', err);
  }
}


// ✅ Start Connecting to the Best Peer
setTimeout(() => connectToBestPeer(), 2000);