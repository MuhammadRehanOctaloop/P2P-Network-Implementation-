import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { kadDHT } from '@libp2p/kad-dht'
import { bootstrap } from '@libp2p/bootstrap'
import { identify } from '@libp2p/identify'  // ✅ Import identify service

const bootstrapNodes = [
  '/ip4/127.0.0.1/tcp/15001/p2p/QmBootstrapNodeID'
]

const node = await createLibp2p({
  addresses: {
    listen: ['/ip4/127.0.0.1/tcp/0']
  },
  transports: [tcp()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  peerDiscovery: [
    bootstrap({ list: bootstrapNodes }) // Enable Bootstrap Nodes
  ],
  services: {
    dht: kadDHT(), // Enable Distributed Hash Table
    identify: identify() // ✅ Add identify service to resolve the error
  }
})

await node.start()
console.log('Node started with ID:', node.peerId.toString())

node.addEventListener('peer:discovery', (evt) => {
  console.log('Discovered peer:', evt.detail.id.toString())
})



// Creates a libp2p node with TCP transport and Noise encryption.
// Listens for connections on a random port (127.0.0.1/tcp/0).
// Uses bootstrap nodes to find other peers.
// Enables DHT (Kademlia) for decentralized peer discovery.
// Starts the node and logs its Peer ID.
// Detects new peers and logs their Peer IDs.