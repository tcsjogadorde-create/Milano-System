const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const fetch = require('node-fetch');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Puxa as credenciais de forma segura do Render (.env)
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const BOT_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const REDIRECT_URI = 'https://milano-system.onrender.com/verify/callback';

let configuredRoleId = 'ID_DO_CARGO_PADRAO';
let configuredLogChannelId = 'ID_DO_CANAL_LOGS_PADRAO';

client.once('ready', async () => {
    console.log(`Milano System online como ${client.user.tag}! 🚀 Sistema seguro.`);
    
    const commands = [
        new SlashCommandBuilder().setName('painel').setDescription('Envia o painel de verificação oficial')
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Comandos slash registados com sucesso!');
    } catch (error) {
        console.error('Erro ao registar comandos slash:', error);
    }
});
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content.startsWith('!setcargo')) {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ Precisas de permissão de Administrador.');
        }
        const args = message.content.split(' ');
        if (!args[1]) return message.reply('⚠️ Uso correto: `!setcargo <ID_DO_CARGO>`');
        
        configuredRoleId = args[1].replace(/<@&|>/g, '');
        return message.reply(`✅ Cargo de verificação atualizado para: <@&${configuredRoleId}>`);
    }

    if (message.content.startsWith('!setlogs')) {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ Precisas de permissão de Administrador.');
        }
        const args = message.content.split(' ');
        if (!args[1]) return message.reply('⚠️ Uso correto: `!setlogs <ID_DO_CANAL>`');
        
        configuredLogChannelId = args[1].replace(/<#|>/g, '');
        return message.reply(`✅ Canal de logs atualizado para <#${configuredLogChannelId}>`);
    }

    if (message.content === '!serverinfo') {
        const { guild } = message;
        const embedServer = new EmbedBuilder()
            .setTitle(`Informações do Servidor: ${guild.name}`)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: '👑 Dono', value: `<@${guild.ownerId}>`, inline: true },
                { name: '👥 Membros', value: `${guild.memberCount}`, inline: true },
                { name: '📅 Criado em', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
            )
            .setColor('#2b2d31')
            .setTimestamp();
        
        return message.reply({ embeds: [embedServer] });
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'painel') {
        const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify+email+guilds.join`;

        const embedPainel = new EmbedBuilder()
            .setTitle('Verificação')
            .setDescription('Se verifique para liberar o servidor')
            .setColor('#2b2d31')
            .setTimestamp();

        const rowButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Verifique-se')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Link)
                .setURL(oauthUrl)
        );

        await interaction.reply({ embeds: [embedPainel], components: [rowButton] });
    }
});
const app = express();

app.get('/verify/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('<h1>Erro</h1><p>Código de autorização em falta.</p>');
    }

    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const tokenData = await tokenResponse.json();
        if (!tokenData.access_token) {
            throw new Error('Falha ao obter o token de acesso da API.');
        }

        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userResponse.json();

        const guild = client.guilds.cache.get(GUILD_ID);
        if (guild) {
            let member = guild.members.cache.get(userData.id) || await guild.members.fetch(userData.id).catch(() => null);

            if (member) {
                if (configuredRoleId && configuredRoleId !== 'ID_DO_CARGO_PADRAO') {
                    await member.roles.add(configuredRoleId).catch(err => console.error('Erro ao dar cargo:', err));
                }

                if (configuredLogChannelId && configuredLogChannelId !== 'ID_DO_CANAL_LOGS_PADRAO') {
                    const logChannel = guild.channels.cache.get(configuredLogChannelId);
                    if (logChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('🛡️ Novo Utilizador Verificado')
                            .setDescription(`O utilizador **${userData.username}** (\`${userData.id}\`) concluiu a verificação com sucesso!`)
                            .setColor('#00b37e')
                            .setTimestamp();
                        logChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Erro ao enviar log:', err));
                    }
                }
            }
        }

        res.send(`
            <!DOCTYPE html>
            <html lang="pt">
            <head>
                <meta charset="UTF-8">
                <title>Verificado com Sucesso</title>
                <style>
                    body { background-color: #121214; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                    .card { background: #202024; padding: 40px; border-radius: 8px; text-align: center; border-top: 4px solid #00b37e; }
                    h1 { color: #00b37e; }
                    a { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #00b37e; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>Verificação Concluída!</h1>
                    <p>Olá, <strong>${userData.username}</strong>. A tua conta foi verificada com sucesso.</p>
                    <a href="discord://">Voltar para o Discord</a>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('Erro no callback:', error);
        res.status(500).send('Erro crítico ao processar a verificação.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor web a escutar na porta ${PORT}`));

client.login(BOT_TOKEN);
