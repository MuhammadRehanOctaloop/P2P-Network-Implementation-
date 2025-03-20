import { createLibp2p } from 'libp2p';
import { webRTC } from '@libp2p/webrtc';
import { noise } from '@libp2p/noise';
import { yamux } from '@chainsafe/libp2pyamux';
import { identify } from '@libp2p/identify';
import { circuitRelayTransport } from '@libp2p/circuitrelayv2';

async function startBrowserNode() {
    const libp2p = await createLibp2p({
        addresses: { listen: ['/webrtc'] },
        transports: [
            webRTC(),
            circuitRelayTransport() // ✅ Fix: Add Circuit Relay Transport
        ],
        connectionEncryption: [noise()],
        streamMuxers: [yamux()],
        services: {
            identify: identify()
        }
    });

    console.log(`✅ Browser node started: ${libp2p.peerId.toString()}`);
}

startBrowserNode();
