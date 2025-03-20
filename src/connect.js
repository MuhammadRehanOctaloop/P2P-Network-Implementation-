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
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { mplex } from '@libp2p/mplex';
import upnp from 'nat-upnp';
import natPMP from 'nat-pmp';

await connectDB();


// async function enableUPnP() {
//   return new Promise((resolve) => {
//     const client = upnp.createClient();

//     client.portMapping({
//       public: 4001,   // Port exposed to the internet
//       private: 4001,  // Port used inside the network
//       protocol: 'TCP',
//       description: 'DVPN Node'
//     }, (err) => {
//       if (err) {
//         console.warn("⚠️ UPnP Port Forwarding Failed. Proceeding without UPnP.");
//         resolve(false);
//       } else {
//         console.log("✅ UPnP Port Forwarded Successfully!");
//         resolve(true);
//       }
//     });

//     client.externalIp((err, ip) => {
//       if (!err) console.log("🌍 External IP:", ip);
//     });
//   });
// }

async function enableUPnP() {
  return new Promise((resolve, reject) => {
    const client = upnp.createClient();
    
    client.portMapping(
      {
        public: 4001,    // External port
        private: 4001,   // Internal port
        ttl: 3600,       // Time to live (1 hour)
        protocol: 'TCP'  // Use TCP (important for libp2p)
      },
      (err) => {
        if (err) {
          console.error("❌ UPnP Port Forwarding Failed:", err);
          reject(err);
        } else {
          console.log("✅ UPnP Port Forwarding Successful on TCP 4001");
          resolve();
        }
      }
    );
  });
}

enableUPnP().catch(() => {
  console.log("⚠️ Continuing without UPnP...");
});




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



const node = await createLibp2p({
  addresses: {
    listen: [
      '/ip4/0.0.0.0/tcp/0',
      '/webrtc',
      '/webrtc-direct',
      '/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star/', // ✅ WebRTC Star Relay
      '/dns4/wrtc-star2.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star/'
    ]
  },
  transports: [
    tcp(),
    webRTC({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },  
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelay', credential: 'openrelay' }  // Free TURN server
      ]
    }),
    webSockets(),
    circuitRelayTransport({ discoverRelays: 2 }) // 🔹 Use public relays
  ],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux(), mplex()],
  services: {
    dht: kadDHT({ protocol: '/ipfs/kad/1.0.0', clientMode: true }),
    identify: identify(),
    bootstrap: bootstrap({ list: bootstrapPeers }),
    ping: ping(),
  },
  relay: {
    enabled: true,
    hop: {
      enabled: true,  // 🔹 Allow using relays
      active: true,   // 🔹 Act as a relay for other peers
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
      const connection = await node.dial(peerId);
      await node.services.ping.ping(peerId);
      const latency = Date.now() - start;
      console.log(`⏱️ Pinged ${peer.peerId}: ${latency}ms`);
      // console.log(peer)
      resolve({ ...peer, latency });
    } catch (error) {
      console.error(`❌ Ping failed for ${peer.peerId}:`, error);
      resolve(null);
    }
  });
}

async function getBestPeer() {
  try {
    const peers = await Peer.find().select("peerId multiaddrs -_id");
    if (!peers.length) {
      console.log("⚠️ No available peers.");
      return null;
    }
    console.log("🔍 Pinging peers to determine the best one...");
    const pingResults = await Promise.all(peers.map(pingPeer));
    const bestPeer = pingResults.filter(peer => peer !== null).sort((a, b) => a.latency - b.latency)[0];
    if (!bestPeer) {
      console.log("❌ No reachable peers found.");
      return null;
    }
    // console.log(bestPeer)
    console.log(`🏆 Best peer selected: ${bestPeer._doc.peerId} (Latency: ${bestPeer.latency}ms)`);
    return bestPeer;
  } catch (error) {
    console.error("❌ Error finding the best peer:", error);
    return null;
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function connectToBestPeer(retryCount = 0) {
  const bestPeer = await getBestPeer();
  try {
    const peerId = peerIdFromString(bestPeer._doc.peerId);
    const stream = await node.dialProtocol(peerId, "/chat/1.0.0");
    console.log(`✅ Connected to Best Peer: ${peerId} (Latency: ${bestPeer.latency}ms)`);
    startChatSession(stream);
    return;
  } catch (err) {
    console.error(`❌ Failed to connect to ${peerId}:`, err);
    const delay = Math.min(5000 * (2 ** retryCount), 60000);
    console.log(`🔄 Retrying in ${delay / 1000} seconds...`);
    setTimeout(() => connectToBestPeer(retryCount + 1), delay);
  }
}

function startChatSession(stream) {
  console.log(`💬 Chat started. Type your message:`);
  rl.on('line', async (message) => {
    try {
      if (stream && !stream.sink.ended) {
        await pipe([fromString(message)], stream.sink);
        console.log('📨 Message sent!');
      } else {
        console.log('⚠️ Stream closed. Reconnecting...');
        await connectToBestPeer();
      }
    } catch (err) {
      console.error('❌ Failed to send message:', err);
    }
  });
  receiveMessages(stream);
}

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

setTimeout(() => connectToBestPeer(), 2000);
