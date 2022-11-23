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

    if (rssUrl in feeds) {
        feeds[rssUrl].add(userId);
    } else {
        feeds[rssUrl] = new Set([userId]);
        feeder.add({ url: rssUrl, refresh: REFRESH_TIME });
    }

    ctx.reply('Subscribed to ' + rssUrl);
    save();
});

const toSend: [number, string][] = []
feeder.on('new-item', (item: any) => {
    for (const userId of feeds[item.meta.link]) {
        toSend.push([userId, item.link]);
    }
});

setInterval(() => {
    const next = toSend.pop();
    if (next) {
        try {
            bot.telegram.sendMessage(next[0], next[1]);
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
        const data = fs.readFileSync(FILE_PATH, 'utf-8').split('\n');
        for (const line of data) {
            if (line) {
                const [url, ...userIds] = line.split(',');
                feeds[url] = new Set(userIds.map((id) => parseInt(id)));
                feeder.add({ url: url, refresh: REFRESH_TIME });
            }
        }
        console.log('Loaded feeds from file');
    }
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

bot.launch();
console.log('Bot started');
load();