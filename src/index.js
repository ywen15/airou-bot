require('dotenv').config();
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const { Client, Events, AttachmentBuilder, GatewayIntentBits } = require('discord.js');
const { logger } = require('./logger.js');
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
        logger.info(`NODE_ENV=${process.env.NODE_ENV}`);
        logger.info("Successfully connected to MongoDB Atlas!")
    } catch (error) {
        logger.error(error);
    }

    // 予約投稿のTodoチェックスケジューラー
    setInterval(checkForReminders, 60 * 1000);
})();

// Bot起動確認
client.once(Events.ClientReady, () => {
    logger.info("Messsage reservation bot started!");
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
    logger.info(`Deleting reminder _id=${_id}`);
    const deleted = await Reminder.deleteOne({ _id: _id });
    logger.info(`Deleted ${deleted.deletedCount} item(s).`);
});

// Botログイン
client.login(process.env.DISCORD_TOKEN);

// メッセージ投稿処理
async function post(targetChannel, msg, attachments) {
    const channel = client.channels.cache.get(targetChannel);

    if (attachments) {
        let image_list = [];
        for (attachment of attachments.split(";")) {
            logger.info(`attachment: ${attachment}`)
            image_list.push(new AttachmentBuilder(attachment));
        }
        logger.info(image_list)
        channel.send({ content: msg, files: image_list });

    } else {
        channel.send(msg);
    }
}

// 投稿時間になったメッセージのチェック処理
async function checkForReminders() {
    logger.info("Checking reminders...");
    const reminders = await Reminder.find({ posted: false, scheduledAt: { $lte: moment() } });
    logger.info(`${reminders.length} reminders found.`);

    for (newPost of reminders) {
        try {
            logger.info(`Posting reminder: _id=${newPost._id}`);
            post(newPost.targetChannel, newPost.content, newPost.attachments);
            newPost.posted = true;
            newPost.save();
            logger.info(`Reminder posted: _id=${newPost._id}`);

        } catch (error) {
            logger.error(`Failed to post message: _id=${newPost._id}`);
            logger.error(error);
        }

    }
}

// 予約投稿の登録処理
async function registerReminder(interaction) {
    const targetChannel = interaction.options.get("channel").value;
    const targetTime = interaction.options.get("time").value;
    const msgId = interaction.options.get("message").value;

    if (!moment(targetTime, "YYYY-MM-DD HH:mm:ss", true).isValid()) {
        let _embeds = JSON.parse(JSON.stringify(embedsErr));
        _embeds.fields.push({ name: "", value: "日時のフォーマットが正しくないニャ" });
        _embeds.fields.push({ name: "", value: "YYYY-MM-DD HH:mm:ss フォーマットで指定するニャ" });
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
        _embeds.fields.push({
            name: "",
            value: `[このメッセージ](${msg.url})が <#${targetChannel}> チャンネルに ${_localizedTime} 頃投稿されるはずニャ〜`
        });
        _embeds.footer.text = savedReminder._id;
        interaction.reply({ embeds: [_embeds] });

    } catch (error) {
        logger.error(error);
        let _embeds = JSON.parse(JSON.stringify(embedsErr));
        _embeds.fields.push({ name: "", value: "指定されたメッセージが存在しないニャ" });
        _embeds.fields.push({ name: "", value: "対象メッセージを右クリック(タップ長押し)してIDをコピーするニャ" });
        interaction.reply({ embeds: [_embeds] });
    }
}