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
import os from 'os'
import { performance } from 'perf_hooks'

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

// Function to get system bandwidth and latency
async function getNodeStats() {
  return {
    location: await getLocation(), // Ideally use a geolocation API to fetch real location
    latency: await measureLatency(),
    bandwidth: getNetworkBandwidth()
  }
}

// for location

async function getLocation() {
    try {
      const res = await fetch('http://ip-api.com/json/')
      const data = await res.json()
      return `${data.city}, ${data.country}`
    } catch (error) {
      console.error("❌ Failed to fetch location:", error)
      return "Unknown"
    }
  }

// Simulate measuring latency
async function measureLatency() {
  const start = performance.now()
  await new Promise(resolve => setTimeout(resolve, Math.random() * 200)) // Simulated delay
  return performance.now() - start
}

// Simulate getting network bandwidth
function getNetworkBandwidth() {
  const networkInterfaces = os.networkInterfaces()
  let bandwidth = 'Unknown'
  
  for (const key in networkInterfaces) {
    for (const net of networkInterfaces[key]) {
      if (!net.internal && net.family === 'IPv4') {
        bandwidth = `${Math.floor(Math.random() * 100) + 10} Mbps` // Simulated value
      }
    }
  }
  return bandwidth
}

// Periodically announce mining availability
async function announceAvailability() {
  const stats = await getNodeStats()
  console.log(`📢 Announcing miner availability:`, stats)
  await node.services.dht.put(Buffer.from(`miner-${node.peerId.toString()}`), Buffer.from(JSON.stringify(stats)))
  setTimeout(announceAvailability, 60000) // Announce every 60 seconds
}

announceAvailability()

// Handle incoming messages
node.handle('/chat/1.0.0', async ({ stream, connection }) => {
  try {
    const senderPeerId = connection.remotePeer.toString()
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
      sendMessage(targetPeerId)
    })
  } catch (err) {
    console.error('❌ Failed to send message:', err)
  }
}
