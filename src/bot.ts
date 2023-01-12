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
const channelid = -1001859135789;

const ilpost = 'https://www.ilpost.it/feed'
const test = 'http://lorem-rss.herokuapp.com/feed?unit=second&interval=30'

feeder.add({ url: ilpost, refresh: REFRESH_TIME });
//feeder.add({ url: test, refresh: REFRESH_TIME });

// ---------- BOT COMMANDS ----------
bot.start((ctx) => ctx.reply('Hi! Send me some newspaper RSS feeds and I will keep you updated!'));
bot.help((ctx) => ctx.reply('Hi! Send me some newspaper RSS feeds and I will keep you updated!'));

bot.command('rss', (ctx) => {
    const myFeeds = Object.keys(feeds).filter((url) => feeds[url].has(ctx.chat.id));
    ctx.reply(myFeeds.length > 0 ? myFeeds.join('\n') : 'No feeds');
});



// ---------- Notifications ----------
const toSend: {
    name: string;
    title: string;
    link: string;
}[] = []


feeder.on('new-item', (item: any) => {

    if (item.title.includes('È morto')) {

            let firstname = item.title.split(' ')[2]
            let surname = item.title.split(' ')[3]

            toSend.push({
                name: firstname + ' ' + surname,
                title: item.title,
                link: item.link,
            });
            console.log(item['media:content']);
        
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
            bot.telegram.sendPhoto(channelid, imgUrl, {
                caption: `<a href="${next.link}">${next.title}</a>\n\n${description}\n\n<b>${siteName}</b> ${section ? '#' + section.replace(' ', '') : ''}`,
                parse_mode: 'HTML',
            });
        } catch (e) {
            console.log(`errore nell'inviare il `);
        }
    }
}, 500);

feeder.on('error', () => {});




// ---------- START ----------
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
bot.launch();

console.log('Bot started');