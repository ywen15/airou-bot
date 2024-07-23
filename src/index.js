require('dotenv-flow').config();
const http = require('http');
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const { Client, Events, AttachmentBuilder, GatewayIntentBits } = require('discord.js');
var HTMLParser = require("node-html-parser");

const { logger } = require('./logger.js');
const Info = require('../models/info.js');
const Reminder = require('../models/reminders.js');
const embedsInfo = require('../resources/embeds-info.js');
const embedsErr = require('../resources/embeds-error.js');

// Discord.jsクライアント
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 即時関数
(async () => {
    try {
        // MongoDB接続
        await mongoose.connect(process.env.DB_URI);
        console.log(`NODE_ENV=${process.env.NODE_ENV}`);
        console.log(`SERVER_ID=${process.env.SERVER_ID}`);
        console.log("Successfully connected to MongoDB Atlas!")
    } catch (error) {
        console.error(error);
    }

    // 予約投稿のTodoチェックスケジューラー
    setInterval(checkForReminders, 60 * 1000);
    setInterval(getOfficialNews, 60 * 5 * 1000);
    setInterval(getUpdateInfo, 60 * 5 * 1000);
    setInterval(getBugInfo, 60 * 5 * 1000);

})();

// Bot起動確認
client.once(Events.ClientReady, () => {
    console.log("Messsage reservation bot started!");
});

// Botアクションリスナー
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
        return;
    }

    if (interaction.commandName === process.env.BOT_NAME) {
        registerReminder(interaction);
    }
});

client.on(Events.MessageDelete, async (message) => {
    if (message.author.id !== process.env.BOT_ID) {
        return;
    }
    const _id = message.embeds[0].data.footer.text;
    console.log(`Deleting reminder _id=${_id}`);
    const deleted = await Reminder.deleteOne({ _id: _id });
    console.log(`Deleted ${deleted.deletedCount} item(s).`);
});

// Botログイン
client.login(process.env.DISCORD_TOKEN);

http.createServer((req, res) => {
    res.end("OK");
}).listen(process.env.PORT, process.env.ADDRESS, () => { console.log("Server started!") });

// メッセージ投稿処理
async function post(targetChannel, msg, attachments) {
    const channel = client.channels.cache.get(targetChannel);

    if (attachments) {
        let image_list = [];
        for (attachment of attachments.split(";")) {
            console.log(`attachment: ${attachment}`)
            image_list.push(new AttachmentBuilder(attachment));
        }
        console.log(image_list)
        channel.send({ content: msg, files: image_list });

    } else {
        channel.send(msg);
    }
}

// 投稿時間になったメッセージのチェック処理
async function checkForReminders() {
    console.log("Checking reminders...");
    const reminders = await Reminder.find({ posted: false, scheduledAt: { $lte: moment() } });
    console.log(`${reminders.length} reminders found.`);

    for (newPost of reminders) {
        try {
            console.log(`Posting reminder: _id=${newPost._id}`);
            post(newPost.targetChannel, newPost.content, newPost.attachments);
            newPost.posted = true;
            newPost.save();
            console.log(`Reminder posted: _id=${newPost._id}`);

        } catch (error) {
            console.error(`Failed to post message: _id=${newPost._id}`);
            console.error(error);
        }

    }
}

// 予約投稿の登録処理
async function registerReminder(interaction) {
    const targetChannel = interaction.options.get("channel").value;
    let targetTime = interaction.options.get("time").value;
    const msgId = interaction.options.get("message").value;

    if (targetTime.toLowerCase() === "now") {
        targetTime = moment();
    } else if (!moment(targetTime, "YYYY-MM-DD HH:mm", true).isValid()) {
        let _embeds = JSON.parse(JSON.stringify(embedsErr));
        _embeds.fields.push({ name: "", value: "日時のフォーマットが正しくないニャ" });
        _embeds.fields.push({ name: "", value: "YYYY-MM-DD HH:mm フォーマットで指定するニャ" });
        interaction.reply({ embeds: [_embeds] });
        return;
    }

    try {
        const msg = await interaction.channel.messages.fetch(msgId);
        const attachments = (msg.attachments.size > 0) ? msg.attachments.map(a => a.attachment).join(";") : null;

        const reminder = new Reminder({
            targetChannel: targetChannel,
            targetMessageId: msgId,
            content: msg.content,
            attachments: attachments,
            scheduledAt: targetTime,
            createdBy: msg.author.id
        });
        const savedReminder = await reminder.save();

        let _embeds = JSON.parse(JSON.stringify(embedsInfo));
        let _localizedTime = moment(targetTime).locale('ja').format('llll');

        // 過去時間で予約された場合即時投稿される旨のメッセージを通知
        let _postTime = (moment(targetTime) <= moment()) ? `1分以内に` : `${_localizedTime} 頃`;

        _embeds.fields.push({
            name: "",
            value: `[このメッセージ](${msg.url})が <#${targetChannel}> チャンネルに ${_postTime}投稿されるはずニャ〜`
        });
        _embeds.footer.text = savedReminder._id;
        interaction.reply({ embeds: [_embeds] });

    } catch (error) {
        console.error(error);
        let _embeds = JSON.parse(JSON.stringify(embedsErr));
        _embeds.fields.push({ name: "", value: "指定されたメッセージが存在しないニャ" });
        _embeds.fields.push({ name: "", value: "対象メッセージを右クリック(タップ長押し)してIDをコピーするニャ" });
        interaction.reply({ embeds: [_embeds] });
    }
}

// 公式お知らせ取得処理
async function getOfficialNews() {
    const res = await fetch(process.env.URL_OFFICIAL + process.env.URL_NEWS);
    const body = await res.text();
    const html = await HTMLParser.parse(body);
    const links = html?.querySelectorAll("a");

    links.forEach(a => {
        const attrVal = a.getAttribute("href");
        if (attrVal.startsWith(process.env.URL_NEWS)) {
            postUpdateInfo(process.env.URL_OFFICIAL + attrVal, "news");
        }
    })
}

// フォーラムお知らせ取得処理
async function getUpdateInfo() {
    const res = await fetch(process.env.URL_FORUM + process.env.URL_UPDATE_INFO);
    const body = await res.text();
    const html = await HTMLParser.parse(body);
    const links = html?.querySelectorAll("a");
    links.forEach(a => {
        const attrVal = a.getAttribute("href");
        if (attrVal.startsWith(process.env.URL_FORUM)) {
            if (attrVal.includes("release-information")) {
                postUpdateInfo(attrVal, "client-update");

            } else if (attrVal.includes("server-update-information")) {
                postUpdateInfo(attrVal, "server-update");

            }
        }
    })
}

// フォーラムお知らせ取得投稿処理
async function postUpdateInfo(url, type) {
    const urlFromDb = await Info.findOne({ url });
    if (urlFromDb) {
        console.log("Skipping: ", url);
        return;
    }

    const channel = client.channels.cache.get(process.env.NEW_CHANNEL_ID);
    let msg = "";
    switch (type) {
        case "client-update":
            msg += "#リリース情報";
            break;

        case "server-update":
            msg += "#サーバリリース情報";
            break;

        case "bug-fix":
            msg += "#バグ情報";
            break;

        case "news":
            msg += "#お知らせ";
            break;

        default:
            break;
    }
    msg += `\n${url}`;

    console.log("Posting to channel ", process.env.NEW_CHANNEL_ID);
    try {
        channel.send(msg);
        console.log("Posted to channel ", process.env.NEW_CHANNEL_ID);
    } catch (err) {
        console.error("Failed to post to channel ", process.env.NEW_CHANNEL_ID);
    }

    const newInfo = new Info({ type, url, posted: true });
    console.log("Saving URL: ", url);
    try {
        await newInfo.save();
    } catch (err) {
        console.error("Error saving URL: ", url);
    }
    console.log("Saved URL: ", url);
}

// フォーラムバグ修正取得処理
async function getBugInfo() {
    const res = await fetch(process.env.URL_FORUM + process.env.URL_BUG_REPORT);
    const body = await res.text();
    const html = await HTMLParser.parse(body);
    const links = html?.querySelectorAll("a");
    links.forEach(a => {
        const attrVal = a.getAttribute("href");
        if (attrVal.startsWith(process.env.URL_FORUM)) {
            if (attrVal.includes("/t/")) {
                postUpdateInfo(a.getAttribute("href"), "bug-fix");
            }
        }
    })
}