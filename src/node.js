import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { kadDHT } from '@libp2p/kad-dht'
import { identify } from '@libp2p/identify'
import { bootstrap } from '@libp2p/bootstrap'
import { pipe } from 'it-pipe'
import { toString } from 'uint8arrays/to-string'
import { Uint8ArrayList } from 'uint8arraylist'
import readline from 'readline'
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';

// Bootstrap peers
const bootstrapPeers = [
  '/ip4/192.168.18.65/tcp/15001/p2p/YOUR_PEER_ID', // Replace with actual Peer ID
]

const node = await createLibp2p({
  addresses: { listen: ['/ip4/0.0.0.0/tcp/15001'] },
  transports: [tcp()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: {
    dht: kadDHT({ protocol: '/ipfs/kad/1.0.0', clientMode: false }),
    identify: identify(),
    bootstrap: bootstrap({ list: bootstrapPeers }),
    relay: circuitRelayServer({})
  }
})

await node.start()
console.log('✅ Node started with ID:', node.peerId.toString())
console.log('📡 Listening on:', node.getMultiaddrs().map(ma => ma.toString()).join('\n'))

// Handle incoming messages
node.handle('/chat/1.0.0', async ({ stream, connection }) => {
  try {
    const senderPeerId = connection.remotePeer.toString() // Get sender's Peer ID

    await pipe(
      stream.source,
      async function (source) {
        for await (let chunk of source) {
          if (chunk instanceof Uint8ArrayList) {
            chunk = chunk.subarray()
          }
          const message = toString(chunk)
          console.log('📨 Incoming message detected')
          console.log(`💬 Received message from [${senderPeerId}]:`, message)
        }
      }
    )
  } catch (error) {
    console.error('❌ Error reading message:', error)
  }
})

// Discover peers
node.addEventListener('peer:discovery', async (evt) => {
  console.log(`🔍 Discovered peer: ${evt.detail.id.toString()}`)
})

// Interactive chat input
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

async function sendMessage(targetPeerId) {
  try {
    const stream = await node.dialProtocol(targetPeerId, '/chat/1.0.0')
    rl.question('Enter message: ', async (message) => {
      await pipe([Buffer.from(message)], stream.sink)
      console.log('📨 Message sent!')
      sendMessage(targetPeerId) // Recursively ask for more messages
    })
  } catch (err) {
    console.error('❌ Failed to send message:', err)
  }
}
