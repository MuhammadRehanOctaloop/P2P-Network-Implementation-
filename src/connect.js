import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { kadDHT } from '@libp2p/kad-dht'
import { identify } from '@libp2p/identify'
import { bootstrap } from '@libp2p/bootstrap'
import { pipe } from 'it-pipe'
import { fromString } from 'uint8arrays/from-string'

const bootstrapPeers = [
  '/ip4/192.168.18.65/tcp/15001/p2p/YOUR_PEER_ID', // Replace with actual Peer ID
  '/ip4/192.168.18.65/tcp/15001/p2p/12D3KooWQnfqNpEhLagPAdAPrbgAfx8qUaeaJGp78xi9Z84tN6vb',
  '/ip4/192.168.18.65/tcp/56512/p2p/12D3KooWNNvwpt54WR5LPnt1ypRAF1QgW6deetGMDMLCYY6Aj74g',
  '/ip4/192.168.18.65/tcp/15001/p2p/12D3KooWM93poxXDCAvkjFt8jCCbhTiQqKxEYFGw5PgNmVMkpdXJ'
]

const node = await createLibp2p({
  addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
  transports: [tcp()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: {
    dht: kadDHT({ protocol: '/ipfs/kad/1.0.0', clientMode: true }), // Client mode for DHT
    identify: identify(),
    bootstrap: bootstrap({ list: bootstrapPeers })
  }
})

await node.start()
console.log('✅ Node started with ID:', node.peerId.toString())
console.log('📡 Listening on:', node.getMultiaddrs().map(ma => ma.toString()).join('\n'))

// Discover peers
node.addEventListener('peer:discovery', async (evt) => {
  console.log(`🔍 Discovered peer: ${evt.detail.id.toString()}`)

  try {
    const peerInfo = await node.peerStore.get(evt.detail.id)
    console.log(`🔗 Found peer multiaddresses:`, peerInfo.addresses.map(a => a.multiaddr.toString()))

    // Attempt to connect and send message
    const stream = await node.dialProtocol(evt.detail.id, '/chat/1.0.0')
    await pipe(
      (async function* () {
        yield fromString('Hello from ' + node.peerId.toString())
      })(),
      stream.sink
    )
    console.log('📨 Message sent to discovered peer!')
  } catch (err) {
    console.error('❌ Failed to connect to discovered peer:', node.peerId , err)
  }
})

process.on('SIGINT', async () => {
  console.log('\nShutting down node...')
  await node.stop()
  process.exit(0)
})
