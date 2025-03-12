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

await connectDB();

async function getBootstrapPeers() {
  const peers = await Peer.find();
  return peers.flatMap(peer => peer.multiaddrs);
}

const bootstrapPeers = await getBootstrapPeers();

console.log(bootstrapPeers);

const node = await createLibp2p({
  addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
  transports: [tcp(), circuitRelayTransport()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: {
    dht: kadDHT({ protocol: '/ipfs/kad/1.0.0', clientMode: true }),
    identify: identify(),
    bootstrap: bootstrap({ list: bootstrapPeers })
  },
  relay: {
    enabled: true,
    hop: {
      enabled: true,
      active: true,
    },
  },
});

await node.start()
console.log('✅ Node started with ID:', node.peerId.toString())
console.log('📡 Listening on:', node.getMultiaddrs().map(ma => ma.toString()).join('\n'))

// Discover peers & establish communication
node.addEventListener('peer:discovery', async (evt) => {
  console.log(`🔍 Discovered peer: ${evt.detail.id.toString()}`)
  
  try {
    const stream = await node.dialProtocol(evt.detail.id, '/chat/1.0.0')
    console.log('🔗 Connected to peer:', evt.detail.id.toString())

    rl.question('Enter message: ', async (message) => {
      await pipe([fromString(message)], stream.sink)
      console.log('📨 Message sent!')
    })

  } catch (err) {
    console.error('❌ Failed to connect:', err)
    console.error(evt.detail.id)
  }
})

// Interactive chat input
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

async function sendMessage(targetPeerId) {
  try {
    const stream = await node.dialProtocol(targetPeerId, '/chat/1.0.0');
    rl.question('Enter message: ', async (message) => {
      await pipe([fromString(message)], stream.sink);
      console.log('📨 Message sent!');
      sendMessage(targetPeerId);
    });
  } catch (err) {
    console.error('❌ Failed to send message:', err);
  }
}
