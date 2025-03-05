import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { kadDHT } from '@libp2p/kad-dht'
import { identify } from '@libp2p/identify'
import { multiaddr } from '@multiformats/multiaddr'

if (process.argv.length < 3) {
  console.error('Usage: node connect.js <multiaddress>')
  process.exit(1)
}

const targetAddress = process.argv[2] // Get the multiaddress from command line

const node = await createLibp2p({
  addresses: {
    listen: ['/ip4/0.0.0.0/tcp/0'] // Random available port
  },
  transports: [tcp()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: {
    dht: kadDHT(),
    identify: identify()
  }
})

await node.start()
console.log('✅ Node started with ID:', node.peerId.toString())
console.log('📡 Listening on:')
node.getMultiaddrs().forEach((ma) => console.log(`   ${ma.toString()}`))

try {
  console.log(`🔗 Connecting to peer at: ${targetAddress}`)
  await node.dial(multiaddr(targetAddress))
  console.log(`✅ Successfully connected to peer at ${targetAddress}`)
} catch (error) {
  console.error('❌ Connection failed:', error)
}

// Keep the node running
process.on('SIGINT', async () => {
  console.log('\nShutting down node...')
  await node.stop()
  process.exit(0)
})
