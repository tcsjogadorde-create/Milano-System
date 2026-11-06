const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const fetch = require('node-fetch');
const sqlite3 = require('sqlite3').verbose();

// Configuração do Banco de Dados Local (SQLite)
const db = new sqlite3.Database('./verificacoes.db', (err) => {
    if (err) console.error('Erro ao abrir o banco de dados:', err.message);
    else console.log('Banco de dados SQLite conectado com sucesso!');
});

db.run(`CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    username TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Puxa as credenciais do Render
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const BOT_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'https://milano-system.onrender.com/verify/callback';

let dynamicRoleId = process.env.DISCORD_VERIFIED_ROLE_ID || '';
let dynamicLogChannelId = '';
const META_GERAL_MEMBROS = 1000; // Meta total de capacidade geral

client.once('ready', async () => {
    console.log(`Milano System online como ${client.user.tag}! 🚀`);
    
    const commands = [
        new SlashCommandBuilder().setName('painel').setDescription('Envia o painel de verificação oficial'),
        new SlashCommandBuilder()
            .setName('config')
            .setDescription('Configura o sistema de verificação')
            .addRoleOption(option => option.setName('cargo').setDescription('Cargo dado na verificação').setRequired(true))
            .addChannelOption(option => option.setName('canal_logs').setDescription('Canal de logs').setRequired(true)),
        new SlashCommandBuilder()
            .setName('estatisticas')
            .setDescription('Mostra todas as estatísticas detalhadas do sistema')
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Comandos slash registados com sucesso!');
    } catch (error) {
        console.error('Erro ao registar comandos slash:', error);
    }
});

// Comando !serverinfo substituído pelo Painel de Estatísticas Solicitado
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content.startsWith('!serverinfo')) {
        db.all(`SELECT * FROM stats`, async (err, rows) => {
            if (err) return message.reply('❌ Erro ao buscar dados de estatísticas.');

            const agora = new Date();
            const hojeStr = agora.toISOString().split('T')[0];
            
            const umaSemanaAtras = new Date();
            umaSemanaAtras.setDate(agora.getDate() - 7);

            let total = rows.length;
            let hojeCount = 0;
            let semanaCount = 0;

            rows.forEach(r => {
                const dataRegistro = new Date(r.timestamp);
                const dataStr = dataRegistro.toISOString().split('T')[0];

                if (dataStr === hojeStr) hojeCount++;
                if (dataRegistro >= umaSemanaAtras) semanaCount++;
            });

            let disponiveisGeral = Math.max(0, META_GERAL_MEMBROS - total);

            const embedStats = new EmbedBuilder()
                .setTitle('📊 Painel de Estatísticas — Milano System')
                .setDescription('Métricas detalhadas em tempo real do sistema de verificação e fluxo.')
                .setColor('#00b37e')
                .addFields(
                    { name: '📌 Total de Verificados', value: `\`\`\`fix\n${total} membros\`\`\``, inline: true },
                    { name: '📅 Verificados Hoje', value: `\`\`\`fix\n${hojeCount} membros\`\`\``, inline: true },
                    { name: '📈 Verificados na Semana', value: `\`\`\`fix\n${semanaCount} membros\`\`\``, inline: true },
                    { name: '🚀 Membros Já Puxados', value: `\`\`\`css\n[ ${total} ]\`\`\``, inline: true },
                    { name: '🎯 Disponíveis no Geral', value: `\`\`\`css\n[ ${disponiveisGeral} / ${META_GERAL_MEMBROS} ]\`\`\``, inline: true }
                )
                .setFooter({ text: 'Milano System • Consulta via !serverinfo' })
                .setTimestamp();

            await message.reply({ embeds: [embedStats] });
        });
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'config') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Precisas de permissão de Administrador.', ephemeral: true });
        }
        dynamicRoleId = interaction.options.getRole('cargo').id;
        dynamicLogChannelId = interaction.options.getChannel('canal_logs').id;
        return interaction.reply({ content: `✅ **Configuração salva com sucesso!**\n• Cargo: <@&${dynamicRoleId}>\n• Logs: <#${dynamicLogChannelId}>`, ephemeral: true });
    }

    if (interaction.commandName === 'painel') {
        const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify+email+guilds.join`;

        const embedPainel = new EmbedBuilder()
            .setTitle('🛡️ Sistema de Verificação - Milano')
            .setDescription('Clique no botão abaixo para verificar a sua conta de forma rápida e segura para liberar o acesso total ao servidor.')
            .setColor('#2b2d31')
            .setFooter({ text: 'Protegido por Milano System' })
            .setTimestamp();

        const rowButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Verificar Conta')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Link)
                .setURL(oauthUrl)
        );

        await interaction.reply({ embeds: [embedPainel], components: [rowButton] });
    }

    if (interaction.commandName === 'estatisticas') {
        db.all(`SELECT * FROM stats`, async (err, rows) => {
            if (err) return interaction.reply({ content: '❌ Erro ao buscar estatísticas no banco de dados.', ephemeral: true });

            const agora = new Date();
            const hojeStr = agora.toISOString().split('T')[0];
            
            const umaSemanaAtras = new Date();
            umaSemanaAtras.setDate(agora.getDate() - 7);

            let total = rows.length;
            let hojeCount = 0;
            let semanaCount = 0;

            rows.forEach(r => {
                const dataRegistro = new Date(r.timestamp);
                const dataStr = dataRegistro.toISOString().split('T')[0];

                if (dataStr === hojeStr) hojeCount++;
                if (dataRegistro >= umaSemanaAtras) semanaCount++;
            });

            let disponiveisGeral = Math.max(0, META_GERAL_MEMBROS - total);

            const embedStats = new EmbedBuilder()
                .setTitle('📊 Painel de Estatísticas — Milano System')
                .setDescription('Acompanhe abaixo o desempenho em tempo real do sistema de verificação e fluxo de membros.')
                .setColor('#00b37e')
                .addFields(
                    { name: '📌 Total de Verificados', value: `\`\`\`fix\n${total} membros\`\`\``, inline: true },
                    { name: '📅 Verificados Hoje', value: `\`\`\`fix\n${hojeCount} membros\`\`\``, inline: true },
                    { name: '📈 Verificados na Semana', value: `\`\`\`fix\n${semanaCount} membros\`\`\``, inline: true },
                    { name: '🚀 Total Já Puxados', value: `\`\`\`css\n[ ${total} ]\`\`\``, inline: true },
                    { name: '🎯 Disponíveis no Geral', value: `\`\`\`css\n[ ${disponiveisGeral} / ${META_GERAL_MEMBROS} ]\`\`\``, inline: true }
                )
                .setFooter({ text: 'Milano System • Estatísticas Atualizadas' })
                .setTimestamp();

            await interaction.reply({ embeds: [embedStats] });
        });
    }
});

// Servidor Web para o Callback do OAuth2
const app = express();

app.get('/verify/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('<h1>Erro</h1><p>Código de autorização em falta.</p>');

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
        if (!tokenData.access_token) throw new Error('Falha ao obter token de acesso.');

        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userResponse.json();

        const guild = client.guilds.cache.get(GUILD_ID);
        if (guild) {
            let member = guild.members.cache.get(userData.id) || await guild.members.fetch(userData.id).catch(() => null);

            if (member) {
                // Dar o cargo automático
                if (dynamicRoleId) {
                    await member.roles.add(dynamicRoleId).catch(err => console.error('Erro ao dar cargo:', err));
                }

                // Salvar no Banco de Dados
                db.run(`INSERT INTO stats (user_id, username) VALUES (?, ?)`, [userData.id, userData.username]);

                // Enviar Log Estilizado
                if (dynamicLogChannelId) {
                    const logChannel = guild.channels.cache.get(dynamicLogChannelId);
                    if (logChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('🛡️ Novo Utilizador Verificado')
                            .setDescription(`O utilizador **${userData.username}** foi verificado e puxado com sucesso para o servidor.`)
                            .addFields(
                                { name: '🆔 ID do Utilizador', value: `\`${userData.id}\``, inline: true },
                                { name: '⏱️ Horário', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                            )
                            .setColor('#00b37e')
                            .setTimestamp();
                        logChannel.send({ embeds: [logEmbed] }).catch(() => {});
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
                    .card { background: #202024; padding: 40px; border-radius: 8px; text-align: center; border-top: 4px solid #00b37e; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
                    h1 { color: #00b37e; margin-bottom: 10px; }
                    p { color: #a8a8b3; }
                    a { display: inline-block; margin-top: 25px; padding: 12px 25px; background: #00b37e; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; transition: background 0.2s; }
                    a:hover { background: #008f65; }
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
        res.status(500).send('Erro crítico ao processar verificação.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor web a escutar na porta ${PORT}`));

client.login(BOT_TOKEN);
              
