export default function handler(req, res) {
    const ping = new Date();
    ping.setHours(ping.getHours() - 3);

    console.log(`Ping at: ${ping.getUTCHours()}:${ping.getUTCMinutes()}:${ping.getUTCSeconds()}`);
    res.sendStatus(200);
}
