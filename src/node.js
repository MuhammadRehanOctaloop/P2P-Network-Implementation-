import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { kadDHT } from '@libp2p/kad-dht'
import { identify } from '@libp2p/identify'

const node = await createLibp2p({
  addresses: {
    listen: ['/ip4/0.0.0.0/tcp/15001'] // Listen on all interfaces
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

// Keep the node running
process.on('SIGINT', async () => {
  console.log('\nShutting down node...')
  await node.stop()
  process.exit(0)
})
