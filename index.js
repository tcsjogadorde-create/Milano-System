const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();

// --- CONFIGURAÇÕES DO SISTEMA ---
const CLIENT_ID = process.env.CLIENT_ID || 'O_TEU_DISCORD_CLIENT_ID';
const CLIENT_SECRET = process.env.CLIENT_SECRET || 'O_TEU_DISCORD_CLIENT_SECRET';
const REDIRECT_URI = 'https://milano-system.onrender.com/verify/callback';
const DISCORD_INVITE_LINK = process.env.DISCORD_INVITE_LINK || 'https://discord.gg/oteuconvite';

// 1. Base de Dados PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS guild_settings (
                guild_id VARCHAR(32) PRIMARY KEY,
                role_id VARCHAR(32),
                log_channel_id VARCHAR(32)
            );
            CREATE TABLE IF NOT EXISTS verified_users (
                user_id VARCHAR(32),
                guild_id VARCHAR(32),
                verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, guild_id)
            );
        `);
        console.log('[DB] Tabelas e esquemas inicializados com sucesso.');
    } catch (err) {
        console.error('[DB] Erro ao criar tabelas na base de dados:', err);
    }
}
initDB();

async function getConfig(guildId) {
    const res = await pool.query('SELECT * FROM guild_settings WHERE guild_id = $1', [guildId]);
    return res.rows[0] || { role_id: null, log_channel_id: null };
}

async function saveConfig(guildId, roleId, logChannelId) {
    await pool.query(`
        INSERT INTO guild_settings (guild_id, role_id, log_channel_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (guild_id) 
        DO UPDATE SET role_id = COALESCE($2, guild_settings.role_id), log_channel_id = COALESCE($3, guild_settings.log_channel_id)
    `, [guildId, roleId, logChannelId]);
}

// 2. Cliente do Bot Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// 3. Servidor Web Express
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.get('/', (req, res) => {
    res.send('Milano System Web API & Bot estão 100% online e operacionais!');
});
  // --- ROTA DE CALLBACK DA VERIFICAÇÃO WEB (OAUTH2) ---
app.get('/verify/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('Erro crítico: Código de autorização do Discord não encontrado.');

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
        if (!tokenData.access_token) return res.status(400).send('Erro ao autenticar o token de acesso com o Discord.');

        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userResponse.json();

        const guildsResult = await pool.query('SELECT * FROM guild_settings WHERE role_id IS NOT NULL');
        
        for (const row of guildsResult.rows) {
            try {
                const guild = await client.guilds.fetch(row.guild_id);
                const member = await guild.members.fetch(userData.id).catch(() => null);

                if (member) {
                    await member.roles.add(row.role_id);

                    await pool.query(`
                        INSERT INTO verified_users (user_id, guild_id, verified_at)
                        VALUES ($1, $2, NOW())
                        ON CONFLICT (user_id, guild_id) DO NOTHING
                    `, [userData.id, row.guild_id]);

                    if (row.log_channel_id) {
                        const logChannel = await guild.channels.fetch(row.log_channel_id).catch(() => null);
                        if (logChannel) {
                            await logChannel.send(`**+1 membro verificado**\n<@${userData.id}> foi verificado com sucesso ✅`);
                        }
                    }
                    break;
                }
            } catch (e) {
                console.error(`Erro ao processar verificação na guild ID ${row.guild_id}:`, e);
            }
        }

        res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Verificado com Sucesso!</title>
                <style>
                    body { background-color: #0f172a; color: #ffffff; font-family: 'Segoe UI', Arial, sans-serif; text-align: center; padding-top: 80px; margin: 0; }
                    .card { background-color: #1e293b; padding: 40px; border-radius: 16px; display: inline-block; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 400px; width: 90%; }
                    h1 { color: #22c55e; margin-bottom: 10px; }
                    p { color: #cbd5e1; font-size: 16px; line-height: 1.5; }
                    .btn { display: inline-block; margin-top: 25px; padding: 14px 28px; background-color: #5865F2; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; transition: background 0.2s; }
                    .btn:hover { background-color: #4752C4; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>✅ Verificação Concluída!</h1>
                    <p>Olá <b>${userData.username}</b>, o teu acesso ao servidor foi libertado com sucesso!</p>
                    <p>Redirecionando automaticamente de volta para o Discord...</p>
                    <a href="${DISCORD_INVITE_LINK}" class="btn">Voltar para o Discord</a>
                </div>
                <script>
                    setTimeout(() => { window.location.href = "${DISCORD_INVITE_LINK}"; }, 3000);
                </script>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('Erro crítico no fluxo web OAuth2:', error);
        res.status(500).send('Ocorreu um erro interno ao processar a verificação.');
    }
});
// --- COMANDOS DO BOT DISCORD ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();
    const guildId = message.guild.id;

    // 1. Comando: !verificar-painel
    if (command === '!verificar-painel') {
        if (!message.member.permissions.has('Administrator')) return message.reply('❌ Apenas administradores podem utilizar este comando.');

        const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join`;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Verifique-se').setURL(oauthUrl).setEmoji('✅')
        );

        const embed = new EmbedBuilder()
            .setTitle('Verificação')
            .setDescription('Se verifique para liberar o servidor')
            .setColor(0x5865F2)
            .setFooter({ text: 'Milano System Security' });

        return message.channel.send({ embeds: [embed], components: [row] });
    }

    // 2. Comando: !setcargo (Menu Select interativo)
    if (command === '!setcargo') {
        if (!message.member.permissions.has('Administrator')) return message.reply('❌ Apenas administradores.');

        const roles = message.guild.roles.cache
            .filter(r => r.id !== message.guild.id && !r.managed)
            .first(25);

        if (roles.length === 0) return message.reply('⚠️ Não existem cargos disponíveis para configurar.');

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('setup_role_select')
            .setPlaceholder('Escolhe o cargo de verificação...')
            .addOptions(roles.map(role => ({ label: role.name.substring(0, 100), value: role.id })));

        const row = new ActionRowBuilder().addComponents(selectMenu);
        return message.reply({ content: '⚙️ **Configuração de Cargo:** Seleciona abaixo qual será o cargo atribuído após a verificação:', components: [row] });
    }

    // 3. Comando: !setlogs (Menu Select interativo para canais)
    if (command === '!setlogs') {
        if (!message.member.permissions.has('Administrator')) return message.reply('❌ Apenas administradores.');

        const channels = message.guild.channels.cache.filter(c => c.type === 0).first(25);
        if (channels.length === 0) return message.reply('⚠️ Não existem canais de texto disponíveis.');

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('setup_log_select')
            .setPlaceholder('Escolhe o canal de logs...')
            .addOptions(channels.map(channel => ({ label: `#${channel.name}`.substring(0, 100), value: channel.id })));

        const row = new ActionRowBuilder().addComponents(selectMenu);
        return message.reply({ content: '⚙️ **Configuração de Logs:** Seleciona o canal onde serão enviadas as notificações de sucesso:', components: [row] });
    }

    // 4. Comando: !pull (Barra de progresso percentual dinâmica e autónoma)
    if (command === '!pull') {
        if (!message.member.permissions.has('Administrator')) return message.reply('❌ Apenas administradores.');
        const config = await getConfig(guildId);
        if (!config.role_id) return message.reply('⚠️ Define primeiro o cargo de verificação usando o comando `!setcargo`.');

        const statusMsg = await message.reply('🔄 **A iniciar o Pull...** A carregar e analisar todos os membros do servidor.');
        
        try {
            const members = await message.guild.members.fetch();
            const totalMembers = members.size;
            let processed = 0;
            let synced = 0;

            for (const [id, member] of members) {
                processed++;
                if (member.roles.cache.has(config.role_id)) {
                    await pool.query(`
                        INSERT INTO verified_users (user_id, guild_id)
                        VALUES ($1, $2)
                        ON CONFLICT (user_id, guild_id) DO NOTHING
                    `, [id, guildId]);
                    synced++;
                }

                if (processed % 25 === 0 || processed === totalMembers) {
                    const percent = Math.round((processed / totalMembers) * 100);
                    const filled = Math.round(percent / 10);
                    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
                    await statusMsg.edit(`🔄 **A efetuar Pull...**\n[${bar}] \`${percent}%\` (${processed}/${totalMembers} processados)`);
                }
            }

            return statusMsg.edit(`✅ **Pull finalizado com sucesso!**\n• Membros sincronizados: \`${synced}\`\n• Total analisado: \`${totalMembers}\``);
        } catch (err) {
            console.error('Erro durante o comando !pull:', err);
            return statusMsg.edit('❌ Ocorreu um erro ao executar o Pull. Certifica-te de que a opção **Server Members Intent** está ativa no painel do Discord Developer Portal.');
        }
    }

    // 5. Comando: !serverinfo (Estatísticas detalhadas estilo Loritta)
    if (command === '!serverinfo') {
        const totalMembers = message.guild.memberCount;
        const totalRes = await pool.query('SELECT COUNT(*) FROM verified_users WHERE guild_id = $1', [guildId]);
        const todayRes = await pool.query("SELECT COUNT(*) FROM verified_users WHERE guild_id = $1 AND verified_at >= CURRENT_DATE", [guildId]);
        const weekRes = await pool.query("SELECT COUNT(*) FROM verified_users WHERE guild_id = $1 AND verified_at >= NOW() - INTERVAL '7 days'", [guildId]);

        const verifiedCount = parseInt(totalRes.rows[0].count);
        const todayCount = parseInt(todayRes.rows[0].count);
        const weekCount = parseInt(weekRes.rows[0].count);

        const progressPercent = Math.min(Math.round((verifiedCount / totalMembers) * 100), 100);
        const filledBars = Math.round(progressPercent / 10);
        const progressBar = '█'.repeat(filledBars) + '░'.repeat(10 - filledBars);

        const embed = new EmbedBuilder()
            .setTitle(`📊 Informações do Servidor - ${message.guild.name}`)
            .setColor(0x5865F2)
            .addFields(
                { name: '👥 Membros Verificados', value: `\`${verifiedCount} / ${totalMembers}\` (${progressPercent}%)\n${progressBar}`, inline: false },
                { name: '📅 Verificados Hoje', value: `\`{todayCount} membros\``.replace('{todayCount}', todayCount), inline: true },
                { name: '📆 Verificados na Semana', value: `\`${weekCount} membros\``, inline: true }
            )
            .setFooter({ text: 'Milano System • Estatísticas em Tempo Real' })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    // 6. Comando: !ping
    if (command === '!ping') {
        const reply = message.reply ? await message.reply('🏓 A calcular latência...') : null;
        if (!reply) return;
        const ping = reply.createdTimestamp - message.createdTimestamp;
        return reply.edit(`🏓 **Pong!**\n• Latência do Bot: \`${ping}ms\`\n• Latência da API: \`${Math.round(client.ws.ping)}ms\``);
    }
});

// --- GESTÃO DOS MENUS INTERATIVOS (Dropdowns de Configuração) ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    const guildId = interaction.guild.id;

    if (interaction.customId === 'setup_role_select') {
        const roleId = interaction.values[0];
        await saveConfig(guildId, roleId, null);
        const selectedRole = interaction.guild.roles.cache.get(roleId);
        return interaction.update({
            content: `✅ Cargo de verificação definido com sucesso para: **${selectedRole ? selectedRole.name : roleId}** ☑️`,
            components: []
        });
    }

    if (interaction.customId === 'setup_log_select') {
        const channelId = interaction.values[0];
        await saveConfig(guildId, null, channelId);
        const selectedChannel = interaction.guild.channels.cache.get(channelId);
        return interaction.update({
            content: `✅ Canal de logs de verificação definido para: **#${selectedChannel ? selectedChannel.name : channelId}** ☑️`,
            components: []
        });
    }
});

client.once('ready', () => {
    console.log(`[BOT] Milano System online com sucesso como ${client.user.tag}!`);
});

app.listen(PORT, () => {
    console.log(`[WEB] Servidor web a escutar na porta ${PORT}`);
});

client.login(process.env.DISCORD_BOT_TOKEN);
          
