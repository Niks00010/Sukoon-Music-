const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const { Connectors } = require("shoukaku");
const { Kazagumo, Plugins } = require("kazagumo");
const KazagumoFilter = require('kazagumo-filter');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});
client.prefix = new Map();

const Nodes = [{
    name: 'anything',
    url: 'lava.inzeworld.com:3128',
    auth: 'saher.inzeworld.com',
    secure: false
}];


client.manager = new Kazagumo({
    defaultSearchEngine: 'youtube',
    plugins: [new Plugins.PlayerMoved(client), new KazagumoFilter()],
    send: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    }
}, new Connectors.DiscordJS(client), Nodes);


client.commands = new Collection();

require('dotenv').config();

const functions = fs.readdirSync("./src/functions").filter(file => file.endsWith(".js"));
const eventFiles = fs.readdirSync("./src/events").filter(file => file.endsWith(".js"));
const commandFolders = fs.readdirSync("./src/commands");
const prefixFolders = fs.readdirSync("./src/messages").filter((f) => f.endsWith(".js"));

for (arx of prefixFolders) {
    const Cmd = require('./messages/' + arx)
    client.prefix.set(Cmd.name, Cmd)
}

(async () => {
    for (const file of functions) {
        require(`./functions/${file}`)(client);
    }
    client.handleEvents(eventFiles, "./src/events");
    client.handleCommands(commandFolders, "./src/commands");
    await client.login(process.env.token);
})();

client.manager.on('playerStart', (player, track) => {
    const playerStartEvent = require('./events/playerStart');
    playerStartEvent(client, player, track);
});

client.manager.on('playerEmpty', (player) => {
    const playerEmptyEvent = require('./events/playerEmpty');
    playerEmptyEvent(client, player);
});

client.manager.on('playerEnd', (player) => {
    const playerEndEvent = require('./events/playerEnd');
    playerEndEvent(client, player);
});
// Handle Buttons
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId === 'prefix-commands') return;
    if (interaction.customId === 'slash-commands') return;
    if (interaction.customId === 'home') return;

    const player = client.manager.players.get(interaction.guild.id);
    if (!player) return interaction.reply({ content: 'No music is currently playing!', ephemeral: true });

    switch (interaction.customId) {
        case 'skip':
            if (player.queue.size === 0) {
                return interaction.reply({ content: 'No more tracks in the queue to skip!', ephemeral: true });
            }
            player.skip();
            interaction.reply({ content: 'Skipped the current track!', ephemeral: true });
            break;

        case 'shuffle':
            player.queue.shuffle();
            interaction.reply({ content: 'Shuffled the queue!', ephemeral: true });
            break;

        case 'loop':
            if (player.loop === 'track') {
                player.setLoop('none');
                interaction.reply({ content: 'Looping is now disabled.', ephemeral: true });
            } else {
                player.setLoop('track');
                interaction.reply({ content: 'Looping is now enabled for the current track.', ephemeral: true });
            }
            break;

        case 'autoplay':
            if (player.data.get("autoplay")) {
                await player.data.set("autoplay", false);
                await player.queue.clear();

                const embed = new EmbedBuilder()
                    .setTitle("🎶 Autoplay Deactivated")
                    .setDescription("`📻` | Autoplay has been **disabled**. The queue has been cleared, and no more random songs will be played.")
                    .setColor('#E74C3C')
                    .setThumbnail(client.user.displayAvatarURL())
                    .setFooter({ text: 'Autoplay Off', iconURL: client.user.displayAvatarURL() })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            } else {
                const identifier = player.queue.current.identifier;
                const search = `https://www.youtube.com/watch?v=${identifier}&list=RD${identifier}`;
                const res = await player.search(search, { requester: interaction.user });
                if (!res.tracks.length) return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('Red')
                            .setDescription("⚠️ **Autoplay is not supported for this track source!**")
                    ],
                    ephemeral: true
                });

                await player.data.set("autoplay", true);
                await player.data.set("requester", interaction.user);
                await player.data.set("identifier", identifier);
                await player.queue.add(res.tracks[1]);

                const embed = new EmbedBuilder()
                    .setTitle("🎶 Autoplay Activated")
                    .setDescription("`📻` | Autoplay has been **enabled**. Random songs will now continue to play after the current queue.")
                    .setColor('#2ECC71')
                    .addFields(
                        { name: "💽 **Current Song**", value: `[${player.queue.current.title}](${player.queue.current.uri})`, inline: true },
                        { name: "👤 **Requested by**", value: `${interaction.user}`, inline: true }
                    )
                    .setThumbnail(player.queue.current.thumbnail || client.user.displayAvatarURL())
                    .setFooter({ text: 'Autoplay On', iconURL: client.user.displayAvatarURL() })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }
            break;
        case 'previous':
            if (!player) return interaction.reply("No player found!");
            const previous = player.getPrevious();
            if (!previous) return interaction.reply("No previous track found!");
            await player.play(player.getPrevious(true));
            interaction.reply({ content: 'Previous Track Played!!', ephemeral: true })
            break;

        case 'pause':
            if (player.paused) {
                return interaction.reply({ content: 'The player is already paused!', ephemeral: true });
            }
            player.pause(true);
            interaction.reply({ content: 'Paused the music!', ephemeral: true });
            break;

        case 'resume':
            if (!player.paused) {
                return interaction.reply({ content: 'The player is already playing!', ephemeral: true });
            }
            player.pause(false);
            interaction.reply({ content: 'Resumed the music!', ephemeral: true });
            break;

        case 'queue':
            const queueEmbed = new EmbedBuilder()
                .setTitle('Current Queue')
                .setDescription(player.queue.map((track, index) => `${index + 1}. **[${track.title}](${track.uri})**`).join('\n') || 'No tracks in queue.')
                .setColor('#F1C40F');
            interaction.reply({ embeds: [queueEmbed], ephemeral: true });
            break;

        default:
            interaction.reply({ content: 'Unknown action!', ephemeral: true });
            break;
    }
});


//Prefix Commands MessageCreate
client.on('messageCreate', async message => {
    const prefix = process.env.prefix;

    if (!message.content.startsWith(prefix) || message.author.bot) return;
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const prefixcmd = client.prefix.get(command);
    if (prefixcmd) {
        prefixcmd.run(client, message, args)
    }
});

