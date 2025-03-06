import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { kadDHT } from '@libp2p/kad-dht'
import { identify } from '@libp2p/identify'
import { multiaddr } from '@multiformats/multiaddr'
import { pipe } from 'it-pipe'
import { fromString } from 'uint8arrays/from-string'

if (process.argv.length < 3) {
  console.error('Usage: node connect.js <multiaddress>')
  process.exit(1)
}

const targetAddress = process.argv[2]

const node = await createLibp2p({
  addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
  transports: [tcp()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: { dht: kadDHT(), identify: identify() }
})

await node.start()
console.log('✅ Node started with ID:', node.peerId.toString())
console.log('📡 Listening on:', node.getMultiaddrs().map(ma => ma.toString()).join('\n'))

try {
  console.log(`🔗 Connecting to peer at: ${targetAddress}`)
  const stream = await node.dialProtocol(multiaddr(targetAddress), '/chat/1.0.0') // ✅ Set protocol
  console.log(`✅ Successfully connected to peer at ${targetAddress}`)

  await pipe(
    (async function* () {
      yield fromString('Hello from ' + node.peerId.toString()); // Ensure proper Uint8Array conversion
    })(),
    stream.sink
  );
  console.log('📨 Message sent to peer!');

} catch (error) {
  console.error('❌ Connection or message exchange failed:', error)
}

process.on('SIGINT', async () => {
  console.log('\nShutting down node...')
  await node.stop()
  process.exit(0)
})
