import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { kadDHT } from '@libp2p/kad-dht'
import { identify } from '@libp2p/identify'
import { bootstrap } from '@libp2p/bootstrap' // Import bootstrap
import { pipe } from 'it-pipe'
import { toString } from 'uint8arrays/to-string'
import { Uint8ArrayList } from 'uint8arraylist'

// Define bootstrap peers
const bootstrapPeers = [
  '/ip4/192.168.18.65/tcp/15001/p2p/YOUR_PEER_ID' // Replace with actual Peer ID
]

const node = await createLibp2p({
  addresses: { listen: ['/ip4/0.0.0.0/tcp/15001'] },
  transports: [tcp()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: {
    dht: kadDHT({ protocol: '/ipfs/kad/1.0.0', clientMode: false }), // Enable full DHT mode
    identify: identify(),
    bootstrap: bootstrap({ list: bootstrapPeers }) // Add bootstrap peers
  }
})

await node.start()
console.log('✅ Node started with ID:', node.peerId.toString())
console.log('📡 Listening on:', node.getMultiaddrs().map(ma => ma.toString()).join('\n'))

// Handle incoming streams
node.handle('/chat/1.0.0', async ({ stream }) => {
  console.log('📨 Incoming message detected')

  try {
    await pipe(
      stream.source,
      async function (source) {
        for await (let chunk of source) {
          console.log('🧐 Raw chunk received:', chunk)

          if (chunk instanceof Uint8ArrayList) {
            chunk = chunk.subarray() // Convert Uint8ArrayList to Uint8Array
          }

          try {
            const message = toString(chunk)
            console.log('💬 Received message:', message)
          } catch (err) {
            console.error('❌ Error converting chunk to string:', err)
          }
        }
      }
    )
  } catch (error) {
    console.error('❌ Error reading message:', error)
  }
})

// Log discovered peers
node.addEventListener('peer:discovery', (evt) => {
  console.log(`🔍 Discovered peer: ${evt.detail.id.toString()}`)
})

process.on('SIGINT', async () => {
  console.log('\nShutting down node...')
  await node.stop()
  process.exit(0)
})
