const cheerio = require('cheerio');
const request = require('request');
const fs = require('fs');
const puppeteer = require('puppeteer');

const all_videos = new Set();
const sleep = seconds =>
    new Promise(resolve => setTimeout(resolve, (seconds || 1) * 1000));

async function youtube(query, pageNum) {
    try {
    const browser = await puppeteer.launch();
        console.log("browser info", browser);
    } catch (e) {
        console.log("browser error", e);
    }
    const page = await browser.newPage();
    console.log("page info", page);
    await page.setViewport({ width: 1280, height: 800 });
    try {
        await page.goto(`https://www.youtube.com/results?q=${encodeURIComponent(query)}${pageNum ? `&page=${pageNum}` : ''}`);
    } catch (e) {
        console.log("page error", e);
    }
    // await page.goto(
    //     `https://www.youtube.com/results?q=${encodeURIComponent(query)}${page ? `&page=${page}` : ''}`, {waitUntil: 'networkidle'});

    try {
        await page.waitForFunction(`document.title.indexOf('${query}') !== -1`, { timeout: 1000 });
        await page.waitForSelector('ytd-video-renderer,ytd-grid-video-renderer', { timeout: 1000 });
        await sleep(1);

        let html = await page.content();
        results = parse(html);

    } catch (e) {
        console.error(`Problem with scraping ${query}: ${e}`);
    }
    await browser.close();
    return results;
}

function parse(html) {
    // load the page source into cheerio
    const $ = cheerio.load(html);

    // perform queries
    const results = [];
    $('#contents ytd-video-renderer,#contents ytd-grid-video-renderer').each((i, link) => {
        const url = $(link).find('#video-title').attr('href');
        "/watch?v=yhS9LnDoo_w"
        const video_id = url.replace("/watch?v=", "");
        results.push({
            id : video_id,
            link: url,
            thumbnail_src: $(link).find('#thumbnail #img').attr('src'),
            title: $(link).find('#video-title').text(),
            duration: $(link).find('#overlays ytd-thumbnail-overlay-time-status-renderer span').text().replace("\n", "").replace(/\s/g, ''),
            snippet: $(link).find('#description-text').text(),
            channel: $(link).find('#byline-container a').text(),
            channel_link: $(link).find('#byline-container a').attr('href'),
            num_views: $(link).find('#metadata-line span:nth-child(1)').text(),
            release_date: $(link).find('#metadata-line span:nth-child(2)').text(),
        })
    });

    const cleaned = [];
    for (var i=0; i < results.length; i++) {
        let res = results[i];
        if (res.link && res.link.trim() && res.title && res.title.trim()) {
            res.title = res.title.trim();
            res.snippet = res.snippet.trim();
            res.rank = i+1;

            // check if this result has been used before
            if (all_videos.has(res.title) === false) {
                cleaned.push(res);
            }
            all_videos.add(res.title);
        }
    }

    return {
        time: (new Date()).toUTCString(),
        results: cleaned,
    }
}

module.exports.youtube = youtube;