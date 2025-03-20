import { request } from 'stun';

async function getPublicIP() {
    try {
        console.log("🔄 Sending STUN request...");
        const response = await request('stun.l.google.com:19302'); // Google's STUN server

        console.log("📡 STUN Response:", response); // Debugging Output

        // Extract the external IP and Port
        const xorAddressAttr = response.getXorAddress(); // Properly fetch XOR-Mapped Address

        if (xorAddressAttr) {
            console.log(`✅ Public IP Address: ${xorAddressAttr.address}, Port: ${xorAddressAttr.port}`);
        } else {
            console.warn("⚠️ No valid XOR-Mapped Address found in STUN response.");
        }
    } catch (error) {
        console.error("❌ Error fetching STUN response:", error);
    }
}

getPublicIP();
