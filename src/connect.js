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

// ✅ Get Best Peer from DB
async function getBestPeer() {
  try {
    const bestPeer = await Peer.findOne().sort({ latency: 1 }).select("peerId multiaddrs latency -_id");

    if (!bestPeer || !bestPeer.multiaddrs || bestPeer.multiaddrs.length === 0) {
      console.log("⚠️ No best peer available.");
      return null;
    }

    console.log("🏆 Best Peer Selected:", bestPeer);
    return bestPeer;
  } catch (error) {
    console.error("❌ Error fetching best peer:", error);
    return null;
  }
}

// ✅ Interactive chat input setup
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// ✅ Connect to the best peer & start chat
async function connectToBestPeer() {
  const bestPeer = await getBestPeer();
  if (!bestPeer || !bestPeer.multiaddrs.length) {
    console.log("⚠️ No valid peer addresses found.");
    return;
  }

  try {
    const peerId = peerIdFromString(bestPeer.peerId); // Convert string to PeerId
    const stream = await node.dialProtocol(peerId, '/chat/1.0.0');
    console.log(`✅ Connected to Best Peer: ${bestPeer.peerId} (Latency: ${bestPeer.latency}ms)`);

    startChatSession(stream);
  } catch (err) {
    console.error(`❌ Failed to connect to ${bestPeer.peerId}:`, err);
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


// ✅ Start Connecting to the Best Peer (Using DB Data)
setTimeout(connectToBestPeer, 2000);
