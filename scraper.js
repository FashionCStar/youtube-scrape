const cheerio = require('cheerio');
const request = require('request');
const fs = require('fs');
const puppeteer = require('puppeteer');

const sleep = seconds =>
    new Promise(resolve => setTimeout(resolve, (seconds || 1) * 1000));

async function youtube(query, pageNum) {
    const browser = await puppeteer.launch();
    console.log("browser", browser);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    console.log("page", page);
    await page.goto(`https://www.youtube.com/results?q=${encodeURIComponent(query)}${pageNum ? `&page=${pageNum}` : ''}`);
    // await page.goto(
    //     `https://www.youtube.com/results?q=${encodeURIComponent(query)}${page ? `&page=${page}` : ''}`, {waitUntil: 'networkidle'});
    const results = {};

    try {
        await page.waitForFunction(`document.title.indexOf('${keyword}') !== -1`, { timeout: 5000 });
        await page.waitForSelector('ytd-video-renderer,ytd-grid-video-renderer', { timeout: 5000 });
        await sleep(1);

        let html = await page.content();
        fs.writeFile('my-page1.html', html, (error) => { 
            console.log("errorrrrr", error); 
            if (error) throw error;
                console.log('saved file');
        });
        results[keyword] = parse(html);

    } catch (e) {
        console.error(`Problem with scraping ${keyword}: ${e}`);
    }
    // fs.writeFile('my-page1.html', $("#page-manager"), (error) => { 
    //     console.log("errorrrrr", error); 
    //     if (error) throw error;
    //         console.log('saved file');
    // });
    await browser.close();
    return results;
}

function parse(html) {
    // load the page source into cheerio
    const $ = cheerio.load(html);

    // perform queries
    const results = [];
    $('#contents ytd-video-renderer,#contents ytd-grid-video-renderer').each((i, link) => {
        results.push({
            link: $(link).find('#video-title').attr('href'),
            title: $(link).find('#video-title').text(),
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

/**
 * Parse youtube search results from dom elements
 * @param {CheerioStatic} $ - The youtube search results loaded with cheerio
 * @param {CheerioElement} vid - The current video being parsed
 * @returns object with data to return for this video
 */
function parseOldFormat($, vid) {
    // Get video details
    console.log("html template", $(vid).parent().data);
    let $metainfo = $(vid).find(".yt-lockup-meta-info li");
    let $thumbnail = $(vid).find(".yt-thumb img");
    let video = {
        "id": $(vid).parent().data("context-item-id"),
        "title": $(vid).find(".yt-lockup-title").children().first().text(),
        "url": `https://www.youtube.com${$(vid).find(".yt-lockup-title").children().first().attr("href")}`,
        "duration": $(vid).find(".video-time").text().trim() || "Playlist",
        "snippet": $(vid).find(".yt-lockup-description").text(),
        "upload_date": $metainfo.first().text(),
        "thumbnail_src": $thumbnail.data("thumb") || $thumbnail.attr("src"),
        "views": $metainfo.last().text()
    };

    // Get user details
    let $byline = $(vid).find(".yt-lockup-byline");
    let uploader = {
        "username": $byline.text(),
        "url": `https://www.youtube.com${$byline.find("a").attr("href")}`,
        "verified": !!$byline.find("[title=Verified]").length
    };

    // Return json
    return { video: video, uploader: uploader };
}

/**
 * Parse a channelRenderer object from youtube search results
 * @param {object} renderer - The channel renderer
 * @returns object with data to return for this channel
 */
function parseChannelRenderer(renderer) {
    
// console.log("parse channel renderer", renderer);
    let channel = {
        "id": renderer.channelId,
        "title": renderer.title.simpleText,
        "url": `https://www.youtube.com${renderer.navigationEndpoint.commandMetadata.webCommandMetadata.url}`,
        "snippet": renderer.descriptionSnippet ? renderer.descriptionSnippet.runs.reduce(comb, "") : "",
        "thumbnail_src": renderer.thumbnail.thumbnails[renderer.thumbnail.thumbnails.length - 1].url,
        "video_count": renderer.videoCountText ? renderer.videoCountText.runs.reduce(comb, "") : "",
        "subscriber_count": renderer.subscriberCountText ? renderer.subscriberCountText.simpleText : "0 subscribers",
        "verified": renderer.ownerBadges &&
                    renderer.ownerBadges.some(badge => badge.metadataBadgeRenderer.style.indexOf("VERIFIED") > -1) || 
                    false
    };

    return { channel };
}

/**
 * Parse a playlistRenderer object from youtube search results
 * @param {object} renderer - The playlist renderer
 * @returns object with data to return for this playlist
 */
function parsePlaylistRenderer(renderer) {
    // console.log("parse playlist renderer", renderer);
    let thumbnails = renderer.thumbnailRenderer.playlistVideoThumbnailRenderer.thumbnail.thumbnails;
    let playlist = {
        "id": renderer.playlistId,
        "title": renderer.title.simpleText,
        "url": `https://www.youtube.com${renderer.navigationEndpoint.commandMetadata.webCommandMetadata.url}`,
        "thumbnail_src": thumbnails[thumbnails.length - 1].url,
        "video_count": renderer.videoCount
    };

    let uploader = {
        "username": renderer.shortBylineText.runs[0].text,
        "url": `https://www.youtube.com${renderer.shortBylineText.runs[0].navigationEndpoint.commandMetadata.webCommandMetadata.url}`
    };

    return { playlist: playlist, uploader: uploader };
}

/**
 * Parse a radioRenderer object from youtube search results
 * @param {object} renderer - The radio renderer
 * @returns object with data to return for this mix
 */
function parseRadioRenderer(renderer) {
    // console.log("parse radio renderer", renderer);
    let radio = {
        "id": renderer.playlistId,
        "title": renderer.title.simpleText,
        "url": `https://www.youtube.com${renderer.navigationEndpoint.commandMetadata.webCommandMetadata.url}`,
        "thumbnail_src": renderer.thumbnail.thumbnails[renderer.thumbnail.thumbnails.length - 1].url,
        "video_count": renderer.videoCountText.runs.reduce(comb, "")
    };

    let uploader = {
        "username": renderer.shortBylineText ? renderer.shortBylineText.simpleText : "YouTube"
    };

    return { radio: radio, uploader: uploader };
}

/**
 * Parse a videoRenderer object from youtube search results
 * @param {object} renderer - The video renderer
 * @returns object with data to return for this video
 */
function parseVideoRenderer(renderer) {
    // let renderer = content.videoRenderer;
    let video = {
        "id": renderer.videoId,
        "title": renderer.title.runs.reduce(comb, ""),
        "url": `https://www.youtube.com${renderer.navigationEndpoint.commandMetadata.webCommandMetadata.url}`,
        "duration": renderer.lengthText ? renderer.lengthText.simpleText : "Live",
        "snippet": renderer.descriptionSnippet ?
                   renderer.descriptionSnippet.runs.reduce((a, b) => a + (b.bold ? `<b>${b.text}</b>` : b.text), ""):
                   "",
        "upload_date": renderer.publishedTimeText ? renderer.publishedTimeText.simpleText : "Live",
        "thumbnail_src": renderer.thumbnail.thumbnails[renderer.thumbnail.thumbnails.length - 1].url,
        "views": renderer.viewCountText ?
            renderer.viewCountText.simpleText || renderer.viewCountText.runs.reduce(comb, "") :
            (renderer.publishedTimeText ? "0 views" : "0 watching")
    };

    let uploader = {
        "username": renderer.ownerText.runs[0].text,
        "url": `https://www.youtube.com${renderer.ownerText.runs[0].navigationEndpoint.commandMetadata.webCommandMetadata.url}`
    };
    uploader.verified = renderer.ownerBadges &&
        renderer.ownerBadges.some(badge => badge.metadataBadgeRenderer.style.indexOf("VERIFIED") > -1) || 
        false;

    return { video: video, uploader: uploader };
}

/**
 * Combine array containing objects in format { text: "string" } to a single string
 * For use with reduce function
 * @param {string} a - Previous value
 * @param {object} b - Current object
 * @returns Previous value concatenated with new object text
 */
function comb(a, b) {
    return a + b.text;
}

module.exports.youtube = youtube;