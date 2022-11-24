import fs from 'fs';
import RssFeedEmitter from 'rss-feed-emitter';
import { Telegraf } from "telegraf";
import * as dotenv from 'dotenv';
import og from 'open-graph-scraper';
dotenv.config();

const FILE_PATH = process.env.FILE_PATH ?? './users.csv';
const REFRESH_TIME = +(process.env.POLLING_INTERVAL_MINUTES ?? 5);
const patternUrl = new RegExp('^(https?:\\/\\/)?((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|((\\d{1,3}\\.){3}\\d{1,3}))(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*(\\?[;&a-z\\d%_.~+=-]*)?(\\#[-a-z\\d_]*)?$','i');

const feeds: { [url: string]: Set<number> } = {};
const feeder = new RssFeedEmitter();
const bot = new Telegraf(process.env.BOT_TOKEN ?? '');


// ---------- BOT COMMANDS ----------
bot.start((ctx) => ctx.reply('Hi! Send me some newspaper RSS feeds and I will keep you updated!'));
bot.help((ctx) => ctx.reply('Hi! Send me some newspaper RSS feeds and I will keep you updated!'));
bot.command('rss', (ctx) => {
    const myFeeds = Object.keys(feeds).filter((url) => feeds[url].has(ctx.chat.id));
    ctx.reply(myFeeds.length > 0 ? myFeeds.join('\n') : 'No feeds');
});
bot.command('remove', async (ctx) => {
    const rssUrl = ctx.message.text.split(' ')[1];
    if (!rssUrl) {
        ctx.reply('Use:\n<code>/remove rss-url</code>', { parse_mode: 'HTML' } );
        return;
    }

    const userId = ctx.message.from?.id;
    if (rssUrl in feeds) {
        feeds[rssUrl].delete(userId);
    }
    ctx.reply('Unsubscribed from ' + rssUrl);
    save();
});
bot.on('text', async (ctx) => {
    const rssUrl = ctx.message.text;
    const userId = ctx.message.from?.id;
    
    if (!!patternUrl.test(rssUrl)) {
        
        if (rssUrl in feeds) {
            feeds[rssUrl].add(userId);
        } else {
            try {
                feeder.add({ url: rssUrl, refresh: REFRESH_TIME });
                feeds[rssUrl] = new Set([userId]);
            } catch (e) {
                ctx.reply('Invalid RSS feed');
                return;
            }
        }
        
        ctx.reply(`Subscribed to ${rssUrl}`);
        console.log(`${userId} subscribed to ${rssUrl}`);
        save();
    } else {
        ctx.reply('Un url DIOCANE!');
    }
});

// ---------- Notifications ----------
const toSend: {
    userId: number;
    title: string;
    link: string;
}[] = []
feeder.on('new-item', (item: any) => {
    for (const userId of feeds[item.meta.link]) {
        toSend.push({
            userId,
            title: item.title,
            link: item.link,
        });
        // console.log(item['media:content']);
    }
});
setInterval(async () => {
    const next = toSend.pop();
    if (next) {
        const res = (await og({ url: next.link })).result as any;
        const description = res?.ogDescription ?? '';
        const imgUrl = res?.ogImage?.url ?? null;
        const siteName = res?.ogSiteName ?? res?.alAndroidAppName ?? '';
        const section = res?.articleSection ?? '';

        try {
            bot.telegram.sendPhoto(next.userId, imgUrl, {
                caption: `<a href="${next.link}">${next.title}</a>\n\n${description}\n\n<b>${siteName}</b> ${section ? '#' + section.replace(' ', '') : ''}`,
                parse_mode: 'HTML',
            });
        } catch (e) {
            console.log(`Could not send message to ${next.userId}`);
        }
    }
}, 500);
feeder.on('error', () => {});

// ---------- DB ----------
function save() {
    const data = Object.keys(feeds).map((url) => [url, ...feeds[url]].join(',') ).join('\n');
    fs.writeFileSync(FILE_PATH, data);
}
function load() {
    if (fs.existsSync(FILE_PATH)) {
        const urls: string[] = [];
        const data = fs.readFileSync(FILE_PATH, 'utf-8').split('\n');
        for (const line of data) {
            if (line) {
                const [url, ...userIds] = line.split(',');
                feeds[url] = new Set(userIds.map((id) => parseInt(id)));
                urls.push(url);
            }
        }

        feeder.add({ url: urls, refresh: REFRESH_TIME });
        console.log('Loaded feeds from file');
    }
}


// ---------- START ----------
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
bot.launch();
load();
console.log('Bot started');