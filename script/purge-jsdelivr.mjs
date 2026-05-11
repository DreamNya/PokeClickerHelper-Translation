import fs from "fs";
const cdn = "https://purge.jsdelivr.net/gh/DreamNya/PokeClickerHelper-Translation@main/json/";
const resources = fs.readdirSync("json");

const urls = resources.map((name) => `${cdn}${name}`);

// 刷新 jsDelivr 全球缓存
for (const url of urls) {
    await purgeUrl(url);
}

async function purgeUrl(url) {
    try {
        const res = await fetch(url);
        const json = await res.json();
        console.log(`🔄 Purging:`, json);
        if (json.status === "finished") {
            console.log(`✅ Purged: ${url}`);
        } else {
            console.warn(`⚠️ Not finished: ${url}`);
        }
    } catch (err) {
        console.error(`❌ Error purging ${url}:`, err.message);
    }
}
