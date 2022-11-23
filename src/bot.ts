import fs from 'fs';
import RssFeedEmitter from 'rss-feed-emitter';
import { Telegraf } from "telegraf";
import * as dotenv from 'dotenv';
dotenv.config();

const FILE_PATH = './users.csv';
const REFRESH_TIME = 5 * 60 * 1000;
const feeder = new RssFeedEmitter();
const bot = new Telegraf(process.env.BOT_TOKEN ?? '');
const feeds: { [url: string]: Set<number> } = {};
const patternUrl = new RegExp('^(https?:\\/\\/)?'+ // protocol
    '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|'+ // domain name
    '((\\d{1,3}\\.){3}\\d{1,3}))'+ // OR ip (v4) address
    '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*'+ // port and path
    '(\\?[;&a-z\\d%_.~+=-]*)?'+ // query string
    '(\\#[-a-z\\d_]*)?$','i'); // fragment locator

bot.start((ctx) => ctx.reply('Hi! Send me a RSS feed and I will keep you updated!'));
bot.help((ctx) => ctx.reply('Hi! Send me a RSS feed and I will keep you updated!'));

bot.command('rss', (ctx) => {
    const myFeeds = Object.keys(feeds).filter((url) => feeds[url].has(ctx.chat.id));
    ctx.reply(myFeeds.length > 0 ? myFeeds.join('\n') : 'No feeds');
});

bot.command('remove', async (ctx) => {
    const rssUrl = ctx.message.text.split(' ')[1];
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

const toSend: [number, string][] = []
feeder.on('new-item', (item: any) => {
    for (const userId of feeds[item.meta.link]) {
        toSend.push([userId, item.link]);
    }
});

feeder.on('error', () => {});

setInterval(async () => {
    const next = toSend.pop();
    console.log(next);
    if (next) {
        try {
            await bot.telegram.sendMessage(next[0], next[1]);
        } catch (e) {
            console.log(`Could not send message to ${next[0]}`);
        }
    }
}, 500);


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

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

bot.launch();
console.log('Bot started');
load();