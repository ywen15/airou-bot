require('dotenv').config();
const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');

const commands = [
    {
        name: process.env.BOT_NAME,
        description: "指定された時間に任意のチャンネルへ投稿する",
        options: [
            {
                name: "channel",
                description: "投稿先のチャンネル名",
                type: ApplicationCommandOptionType.Channel,
                required: true
            },
            {
                name: "time",
                description: "予約投稿する時刻(YYYY-MM-DD HH:mm:ss)",
                type: ApplicationCommandOptionType.String,
                required: true
            },
            {
                name: "message",
                description: "予約投稿するメッセージのID",
                type: ApplicationCommandOptionType.String,
                required: true
            }
        ]
    }
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log("Registering bot slash commands...");

        await rest.put(
            Routes.applicationGuildCommands(process.env.BOT_ID, process.env.SERVER_ID),
            { body: commands }
        );

        console.log("Bot slash commands were registered successfully!");
    } catch (error) {
        console.log(`Bot slash commands registration failed: ${error}`);
    }
})();