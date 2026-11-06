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

// Credenciais oficiais e variáveis globais do sistema
const CLIENT_ID = '1568307161459589120';
const CLIENT_SECRET = 't72U0KXfExfetaIJamvpWuWVchM0xwTH';
const BOT_TOKEN = 'MTU2ODMwNzE2MTQ1OTU4OTEyMA.GoTIhk.TczUL-1SVTxd06Y0gwE20slunx7c3r8Y-65JTg';
const REDIRECT_URI = 'https://milano-system.onrender.com/verify/callback';
const GUILD_ID = 'ID_DO_TEU_SERVIDOR'; // Substitui pelo ID exato do teu servidor

let configuredRoleId = 'ID_DO_CARGO_PADRAO';
let configuredLogChannelId = 'ID_DO_CANAL_LOGS_PADRAO';

client.once('ready', async () => {
    console.log(`Milano System online como ${client.user.tag}! 🚀 Servidor pronto para operar.`);
    
    const commands = [
        new SlashCommandBuilder().setName('painel').setDescription('Envia o painel de verificação oficial')
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Comandos de barra (Slash) registados com sucesso na API do Discord!');
    } catch (error) {
        console.error('Erro ao registar comandos slash:', error);
    }
});
// Gestão de comandos de texto via prefixo para administradores
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Comando dinâmico !setcargo
    if (message.content.startsWith('!setcargo')) {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ Precisas de permissão de Administrador para configurar o cargo.');
        }
        const args = message.content.split(' ');
        if (!args[1]) return message.reply('⚠️ Uso correto: `!setcargo <ID_DO_CARGO>`');
        
        configuredRoleId = args[1].replace(/<@&|>/g, '');
        return message.reply(`✅ Cargo de verificação atualizado com sucesso para: <@&${configuredRoleId}>`);
    }

    // Comando dinâmico !setlogs
    if (message.content.startsWith('!setlogs')) {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ Precisas de permissão de Administrador para configurar os logs.');
        }
        const args = message.content.split(' ');
        if (!args[1]) return message.reply('⚠️ Uso correto: `!setlogs <ID_DO_CANAL>`');
        
        configuredLogChannelId = args[1].replace(/<#|>/g, '');
        return message.reply(`✅ Canal de logs atualizado com sucesso para <#${configuredLogChannelId}>`);
    }

    // Comando !serverinfo detalhado
    if (message.content === '!serverinfo') {
        const { guild } = message;
        const embedServer = new EmbedBuilder()
            .setTitle(`Informações do Servidor: ${guild.name}`)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: '👑 Dono do Servidor', value: `<@${guild.ownerId}>`, inline: true },
                { name: '👥 Total de Membros', value: `${guild.memberCount}`, inline: true },
                { name: '📅 Data de Criação', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
            )
            .setColor('#2b2d31')
            .setTimestamp();
        
        return message.reply({ embeds: [embedServer] });
    }
});

// Envio do painel oficial de verificação com botão direto para o OAuth2
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
                  // Servidor Express dedicado para processar o retorno do OAuth2 e automações
const app = express();

app.get('/verify/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('<h1>Erro</h1><p>Código de autorização OAuth2 em falta.</p>');
    }

    try {
        // Troca do código temporário pelo token de acesso oficial do Discord
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
            throw new Error('Falha crítica ao obter o token de acesso da API.');
        }

        // Requisição para buscar os dados do utilizador autenticado
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userResponse.json();

        // Processamento do membro no servidor do Discord
        const guild = client.guilds.cache.get(GUILD_ID);
        if (guild) {
            let member = guild.members.cache.get(userData.id);
            if (!member) {
                member = await guild.members.fetch(userData.id).catch(() => null);
            }

            if (member) {
                // Atribuição automática do cargo configurado
                if (configuredRoleId && configuredRoleId !== 'ID_DO_CARGO_PADRAO') {
                    await member.roles.add(configuredRoleId).catch(err => console.error('Erro ao dar cargo:', err));
                }

                // Envio de registo (log) formatado para o canal definido
                if (configuredLogChannelId && configuredLogChannelId !== 'ID_DO_CANAL_LOGS_PADRAO') {
                    const logChannel = guild.channels.cache.get(configuredLogChannelId);
                    if (logChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('🛡️ Novo Utilizador Verificado')
                            .setDescription(`O utilizador **${userData.username}** (\`${userData.id}\`) concluiu o fluxo de verificação com sucesso através do site!`)
                            .setColor('#00b37e')
                            .setTimestamp();
                        logChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Erro ao enviar log:', err));
                    }
                }
            }
        }

        // Página de sucesso elegante renderizada para o utilizador após a verificação
        res.send(`
            <!DOCTYPE html>
            <html lang="pt">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Milano System - Verificado com Sucesso</title>
                <style>
                    body { background-color: #121214; color: #e1e1e6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                    .card { background: #202024; padding: 40px; border-radius: 8px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.6); max-width: 400px; width: 100%; border-top: 4px solid #00b37e; }
                    h1 { color: #00b37e; margin-bottom: 10px; font-size: 24px; }
                    p { color: #a8a8b3; font-size: 14px; line-height: 1.5; margin-bottom: 25px; }
                    strong { color: #fff; }
                    a { display: inline-block; padding: 12px 24px; background: #00b37e; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; transition: background 0.2s; }
                    a:hover { background: #00875f; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>Verificação Concluída!</h1>
                    <p>Olá, <strong>${userData.username}</strong>. A tua conta foi validada com sucesso no Milano System.</p>
                    <a href="discord://">Voltar para o Discord</a>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('Erro no fluxo de callback OAuth2:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html lang="pt">
            <head>
                <meta charset="UTF-8">
                <title>Erro na Verificação</title>
                <style>
                    body { background-color: #121214; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                    .card { background: #202024; padding: 40px; border-radius: 8px; text-align: center; border-top: 4px solid #f75a68; }
                    h1 { color: #f75a68; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>Erro Crítico</h1>
                    <p>Ocorreu uma falha ao processar a tua autorização. Tenta novamente mais tarde.</p>
                </div>
            </body>
            </html>
        `);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor web do Render a escutar na porta ${PORT}`));

client.login(BOT_TOKEN);
