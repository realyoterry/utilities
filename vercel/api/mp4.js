import ytdl from "ytdl-core";

export default async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

    const { url } = req.query;
    if (!url) return res.status(400).send("Invalid query");

    const isValid = ytdl.validateURL(url);
    if (!isValid) return res.status(400).send("Invalid URL");

    try {
        const videoInfo = await ytdl.getInfo(url);
        const videoName = videoInfo.videoDetails.title.replace(/[^a-zA-Z0-9]/g, "_");

        res.setHeader("Content-Disposition", `attachment; filename="${videoName}.mp4"`);
        res.setHeader("Content-Type", "video/mp4");

        ytdl(url, { quality: "highest", format: "mp4" }).pipe(res);
    } catch (error) {
        res.status(500).send("Error processing video");
    }
}
