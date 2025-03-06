import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { kadDHT } from '@libp2p/kad-dht'
import { identify } from '@libp2p/identify'
import { pipe } from 'it-pipe'
import { toString } from 'uint8arrays/to-string'
import { Uint8ArrayList } from 'uint8arraylist' // Import Uint8ArrayList for handling chunks

const node = await createLibp2p({
  addresses: { listen: ['/ip4/0.0.0.0/tcp/15001'] },
  transports: [tcp()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: { dht: kadDHT(), identify: identify() }
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

          // ✅ Fix: Extract buffer from Uint8ArrayList
          if (chunk instanceof Uint8ArrayList) {
            chunk = chunk.subarray() // Convert Uint8ArrayList to a single Uint8Array
          }

          // ✅ Convert chunk to string safely
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

process.on('SIGINT', async () => {
  console.log('\nShutting down node...')
  await node.stop()
  process.exit(0)
})
