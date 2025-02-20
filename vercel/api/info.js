import ytdl from "ytdl-core";

export default async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

    const { url } = req.query;
    if (!url) return res.status(400).send("Invalid query");

    const isValid = ytdl.validateURL(url);
    if (!isValid) return res.status(400).send("Invalid URL");

    try {
        const info = (await ytdl.getInfo(url)).videoDetails;
        res.json({ title: info.title, thumbnail: info.thumbnails[2]?.url });
    } catch (error) {
        res.status(500).send("Error fetching video details");
    }
}
