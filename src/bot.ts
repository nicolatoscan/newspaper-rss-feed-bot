import fs from 'fs';
import RssFeedEmitter from 'rss-feed-emitter';
import { Telegraf } from "telegraf";
import * as dotenv from 'dotenv';
import og from 'open-graph-scraper';
dotenv.config();


const REFRESH_TIME = +(process.env.POLLING_INTERVAL_MINUTES ?? 5);

const feeds: { [url: string]: Set<number> } = {};
const feeder = new RssFeedEmitter({ skipFirstLoad: true });
const bot = new Telegraf(process.env.BOT_TOKEN ?? '');
const channelid = process.env.CHANNEL_ID ?? '';

const ilpost = 'https://www.ilpost.it/feed'


feeder.add({ url: ilpost, refresh: REFRESH_TIME });


bot.start((ctx) => ctx.reply('Hi! sono vivo e sono nuovo!'));


// ---------- Notifications ----------


// every new news 
feeder.on('new-item', (item: any) => {

    

    if (item.title.includes('È mort')) {
        let firstname = item.title.split(' ')[2]
        let surname = item.title.split(' ')[3]

        sendMorto(item)
        
    }
});


async function sendMorto(item: any){
    const res = (await og({ url: item.link })).result as any;
    const description = res?.ogDescription ?? '';
    const imgUrl = res?.ogImage?.url ?? null;
    const siteName = res?.ogSiteName ?? res?.alAndroidAppName ?? '';
    const section = res?.articleSection ?? '';

    try {
        bot.telegram.sendPhoto(channelid, imgUrl, {
            caption: `<a href="${item.link}">${item.title}</a>\n\n${description}\n\n<b>${siteName}</b> ${section ? '#' + section.replace(' ', '') : ''}`,
            parse_mode: 'HTML',
        });
    } catch (e) {
        console.log(`errore nell'inviare il `);
        }
}





feeder.on('error', () => {});




// ---------- START ----------
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
bot.launch();

console.log('Bot started');