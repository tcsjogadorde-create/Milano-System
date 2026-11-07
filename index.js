const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const fs = require('fs');

const DB_FILE = './verificacoes.json';
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ verifications: [], puxadosCount: 0 }, null, 2));
}

function getData() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
            return { verifications: parsed, puxadosCount: parsed.length };
        }
        return parsed;
    } catch (e) {
        return { verifications: [], puxadosCount: 0 };
    }
}

function saveData(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const BOT_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'https://milano-system.onrender.com/verify/callback';

let dynamicRoleId = process.env.DISCORD_VERIFIED_ROLE_ID || '';
let dynamicLogChannelId = process.env.DISCORD_LOG_CHANNEL_ID || '';

client.once('ready', async () => {
    console.log(`Milano System online como ${client.user.tag}! 🚀`);
    
    const commands = [
        new SlashCommandBuilder().setName('painel').setDescription('Envia o painel de verificação oficial padrão'),
        new SlashCommandBuilder()
            .setName('configpainel')
            .setDescription('Cria um painel de verificação personalizado')
            .addStringOption(option => option.setName('titulo').setDescription('Título do painel').setRequired(true))
            .addStringOption(option => option.setName('descricao').setDescription('Descrição do painel').setRequired(true))
            .addStringOption(option => option.setName('imagem').setDescription('URL da imagem (opcional)').setRequired(false)),
        new SlashCommandBuilder()
            .setName('config')
            .setDescription('Configura o sistema de verificação')
            .addRoleOption(option => option.setName('cargo').setDescription('Cargo dado na verificação').setRequired(true))
            .addChannelOption(option => option.setName('canal_logs').setDescription('Canal de logs').setRequired(true)),
        new SlashCommandBuilder()
            .setName('estatisticas')
            .setDescription('Mostra todas as estatísticas detalhadas do sistema'),
        new SlashCommandBuilder()
            .setName('pull')
            .setDescription('Puxa uma quantidade específica de contas autenticadas para o servidor')
            .addIntegerOption(option => option.setName('quantidade').setDescription('Quantidade de contas para puxar').setRequired(true))
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Comandos slash registados com sucesso!');
    } catch (error) {
        console.error('Erro ao registar comandos slash:', error);
    }
});

// COMANDO DE TEXTO LEGADO PARA ESTATÍSTICAS COMPLETAS
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content.startsWith('!serverinfo')) {
        const dbData = getData();
        const rows = dbData.verifications || [];
        const agora = new Date();
        const hojeStr = agora.toISOString().split('T')[0];
        
        const umaSemanaAtras = new Date();
        umaSemanaAtras.setDate(agora.getDate() - 7);

        let totalVerificacoes = rows.length;
        let hojeCount = 0;
        let semanaCount = 0;

        rows.forEach(r => {
            const dataRegistro = new Date(r.timestamp);
            const dataStr = dataRegistro.toISOString().split('T')[0];

            if (dataStr === hojeStr) hojeCount++;
            if (dataRegistro >= umaSemanaAtras) semanaCount++;
        });

        const embedStats = new EmbedBuilder()
            .setTitle('📊 Painel de Estatísticas — Milano Store')
            .setDescription('Métricas operacionais e de estoque em tempo real.')
            .setColor('#FEE75C')
            .addFields(
                { name: '📌 Total de Verificados', value: `\`\`\`fix\n${totalVerificacoes} membros\`\`\``, inline: true },
                { name: '📅 Verificados Hoje', value: `\`\`\`fix\n${hojeCount} membros\`\`\``, inline: true },
                { name: '📈 Verificados na Semana', value: `\`\`\`fix\n${semanaCount} membros\`\`\``, inline: true },
                { name: '🚀 Contas no Auth', value: `\`\`\`css\n[ ${totalVerificacoes} ]\`\`\``, inline: true }
            )
            .setFooter({ text: 'Milano Store • Gestão de Estoque' })
            .setTimestamp();

        return message.reply({ embeds: [embedStats] });
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
        return interaction.reply({ content: `✅ **Configuração salva!**\n• Cargo: <@&${dynamicRoleId}>\n• Logs: <#${dynamicLogChannelId}>`, ephemeral: true });
    }

    // COMANDO PULL COM TRAVA DE ESTOQUE BASEADA NO AUTH DISPONÍVEL
    if (interaction.commandName === 'pull') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Precisas de permissão de Administrador.', ephemeral: true });
        }

        const qtdParaPuxar = interaction.options.getInteger('quantidade');
        if (qtdParaPuxar <= 0) {
            return interaction.reply({ content: '❌ Insere uma quantidade válida maior que zero.', ephemeral: true });
        }

        const dbData = getData();
        const contasAutenticadas = dbData.verifications || [];
        const totalDisponivel = contasAutenticadas.length;

        if (qtdParaPuxar > totalDisponivel) {
            return interaction.reply({
                content: `❌ **Estoque insuficiente no Auth!**\n• Tentaste puxar: \`${qtdParaPuxar}\` contas\n• Disponíveis no Auth: \`${totalDisponivel}\` contas\n\n*Podes apenas puxar do número que tens (${totalDisponivel}) para baixo.*`,
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: false });

        const guild = interaction.guild;
        let puxadosComSucesso = 0;
        const contasParaOEnvio = contasAutenticadas.slice(0, qtdParaPuxar);

        for (const conta of contasParaOEnvio) {
            try {
                await fetch(`https://discord.com/api/guilds/${guild.id}/members/${conta.user_id}`, {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bot ${BOT_TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        access_token: conta.access_token,
                        roles: dynamicRoleId ? [dynamicRoleId] : []
                    })
                });
                puxadosComSucesso++;
            } catch (err) {
                console.error(`[ERRO PULL] Falha ao puxar ${conta.user_id}:`, err);
            }
        }

        const embedPull = new EmbedBuilder()
            .setTitle('📦 Execução de Pull Realizada')
            .setDescription(`O administrador **${interaction.user.tag}** executou o comando de puxada.`)
            .setColor('#FEE75C')
            .addFields(
                { name: '🎯 Quantidade Solicitada', value: `\`\`\`fix\n${qtdParaPuxar} contas\`\`\``, inline: true },
                { name: '🚀 Puxados com Sucesso', value: `\`\`\`css\n[ ${puxadosComSucesso} ]\`\`\``, inline: true },
                { name: '📌 Restantes no Auth', value: `\`\`\`css\n[ ${totalDisponivel - puxadosComSucesso} ]\`\`\``, inline: true }
            )
            .setFooter({ text: 'Milano Store • Gestão de Pull' })
            .setTimestamp();

        return interaction.editReply({ embeds: [embedPull] });
    }

    if (interaction.commandName === 'configpainel') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Precisas de permissão de Administrador.', ephemeral: true });
        }

        const titulo = interaction.options.getString('titulo');
        const descricao = interaction.options.getString('descricao');
        const imagem = interaction.options.getString('imagem');

        const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify+email+guilds.join`;

        const embedPersonalizado = new EmbedBuilder()
            .setTitle(titulo)
            .setDescription(descricao)
            .setColor('#2b2d31')
            .setFooter({ text: 'Protegido por Milano Store' })
            .setTimestamp();

        if (imagem) embedPersonalizado.setImage(imagem);

        const rowButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Verificar Conta').setEmoji('✅').setStyle(ButtonStyle.Link).setURL(oauthUrl)
        );

        await interaction.reply({ content: '✅ Painel personalizado criado com sucesso!', ephemeral: true });
        return interaction.channel.send({ embeds: [embedPersonalizado], components: [rowButton] });
    }

    if (interaction.commandName === 'painel') {
        const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify+email+guilds.join`;

        const embedPainel = new EmbedBuilder()
            .setTitle('🛡️ Sistema de Verificação - Milano Store')
            .setDescription('Clique no botão abaixo para verificar sua conta e liberar o acesso ao servidor.')
            .setColor('#2b2d31')
            .setFooter({ text: 'Protegido por Milano Store' })
            .setTimestamp();

        const rowButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Verificar Conta').setEmoji('✅').setStyle(ButtonStyle.Link).setURL(oauthUrl)
        );

        await interaction.reply({ embeds: [embedPainel], components: [rowButton] });
    }

    if (interaction.commandName === 'estatisticas') {
        const dbData = getData();
        const rows = dbData.verifications || [];
        const agora = new Date();
        const hojeStr = agora.toISOString().split('T')[0];
        
        const umaSemanaAtras = new Date();
        umaSemanaAtras.setDate(agora.getDate() - 7);

        let totalVerificacoes = rows.length;
        let hojeCount = 0;
        let semanaCount = 0;

        rows.forEach(r => {
            const dataRegistro = new Date(r.timestamp);
            const dataStr = dataRegistro.toISOString().split('T')[0];

            if (dataStr === hojeStr) hojeCount++;
            if (dataRegistro >= umaSemanaAtras) semanaCount++;
        });

        const embedStats = new EmbedBuilder()
            .setTitle('📊 Painel de Estatísticas — Milano System')
            .setDescription('Acompanhe abaixo o desempenho operacional do sistema.')
            .setColor('#FEE75C')
            .addFields(
                { name: '📌 Total de Verificados', value: `\`\`\`fix\n${totalVerificacoes} membros\`\`\``, inline: true },
                { name: '📅 Verificados Hoje', value: `\`\`\`fix\n${hojeCount} membros\`\`\``, inline: true },
                { name: '📈 Verificados na Semana', value: `\`\`\`fix\n${semanaCount} membros\`\`\``, inline: true },
                { name: '🚀 Contas no Auth', value: `\`\`\`css\n[ ${totalVerificacoes} ]\`\`\``, inline: true }
            )
            .setFooter({ text: 'Milano Store • Estatísticas' })
            .setTimestamp();

        await interaction.reply({ embeds: [embedStats], ephemeral: true });
    }
});
      const app = express();

app.get('/verify/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('<h1>Erro</h1><p>Código em falta.</p>');

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
        if (!tokenData.access_token) throw new Error('Falha ao obter token.');

        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userResponse.json();

        const dbData = getData();
        const indexExistente = dbData.verifications.findIndex(v => v.user_id === userData.id);

        if (indexExistente >= 0) {
            dbData.verifications[indexExistente].access_token = tokenData.access_token;
            dbData.verifications[indexExistente].username = userData.username;
        } else {
            dbData.verifications.push({ 
                user_id: userData.id, 
                username: userData.username, 
                access_token: tokenData.access_token, 
                timestamp: new Date().toISOString() 
            });
        }
        saveData(dbData);

        const guild = client.guilds.cache.get(GUILD_ID);
        if (guild) {
            try {
                await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${userData.id}`, {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bot ${BOT_TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        access_token: tokenData.access_token,
                        roles: dynamicRoleId ? [dynamicRoleId] : []
                    })
                });
            } catch (err) {
                console.error('[ERRO JOIN GUILD]:', err);
            }

            let member = guild.members.cache.get(userData.id) || await guild.members.fetch(userData.id).catch(() => null);

            if (member) {
                if (dynamicRoleId) {
                    await member.roles.add(dynamicRoleId).catch(() => {});
                }

                if (dynamicLogChannelId) {
                    const logChannel = guild.channels.cache.get(dynamicLogChannelId);
                    if (logChannel) {
                        const avatarUrl = userData.avatar 
                            ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=128` 
                            : member.user.displayAvatarURL({ dynamic: true, size: 128 });

                        const logEmbed = new EmbedBuilder()
                            .setTitle('🛡️ **Novo Utilizador Verificado**')
                            .setDescription(`O utilizador **<@${userData.id}>** verificou-se com sucesso pelo site!`)
                            .setThumbnail(avatarUrl)
                            .addFields(
                                { name: '🆔 **ID**', value: `\`${userData.id}\``, inline: true },
                                { name: '⏱️ **Horário**', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                            )
                            .setColor('#FEE75C')
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
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Milano Auth - Verificação</title>
                <style>
                    * { box-sizing: border-box; }
                    body { background-color: #080b10; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 15px; }
                    .card { background: #111622; padding: 35px 25px; border-radius: 16px; text-align: center; border: 1px solid #1f293d; width: 100%; max-width: 400px; box-shadow: 0 15px 35px rgba(0,0,0,0.8); }
                    .auth-icon-container { width: 75px; height: 75px; background: radial-gradient(circle, rgba(254,231,92,0.15) 0%, rgba(17,22,34,1) 75%); border: 1px solid rgba(254,231,92,0.3); border-radius: 50%; display: flex; justify-content: center; align-items: center; margin: 0 auto 15px auto; box-shadow: 0 0 20px rgba(254,231,92,0.2); }
                    .auth-icon { font-size: 30px; }
                    .auth-brand { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #FEE75C; font-weight: 700; margin-bottom: 8px; }
                    h2 { color: #ffffff; margin-bottom: 10px; font-size: 19px; font-weight: 600; }
                    .status-text { font-size: 13px; color: #8b949e; margin-bottom: 20px; min-height: 20px; font-weight: 500; }
                    .progress-container { width: 100%; background: #1a2233; border-radius: 10px; overflow: hidden; margin: 15px 0 25px 0; height: 7px; }
                    .progress-bar { width: 0%; height: 100%; background: linear-gradient(90deg, #e5cf45, #FEE75C); border-radius: 10px; transition: width 0.6s ease-in-out; }
                    .discord-return-btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; background-color: #FEE75C; color: #23272A; font-weight: 700; font-size: 15px; padding: 12px 20px; border-radius: 8px; text-decoration: none; width: 100%; opacity: 0; pointer-events: none; transition: all 0.2s ease-in-out; }
                    .discord-return-btn.visible { opacity: 1; pointer-events: auto; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="auth-icon-container"><div class="auth-icon">✅</div></div>
                    <div class="auth-brand">Milano Store</div>
                    <h2>Verificação Concluída!</h2>
                    <div class="status-text" id="status">A processar autenticação...</div>
                    <div class="progress-container"><div class="progress-bar" id="bar"></div></div>
                    <a href="https://discord.com/channels/${GUILD_ID}" target="_blank" class="discord-return-btn" id="return-btn">Voltar para o Discord</a>
                </div>
                <script>
                    const statusText = document.getElementById('status');
                    const progressBar = document.getElementById('bar');
                    const returnBtn = document.getElementById('return-btn');
                    setTimeout(() => { statusText.innerText = "Cargo e acesso liberados com sucesso!"; progressBar.style.width = "70%"; }, 500);
                    setTimeout(() => { statusText.innerText = "Tudo pronto! Podes voltar."; progressBar.style.width = "100%"; returnBtn.classList.add('visible'); }, 1500);
                </script>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('[ERRO CRÍTICO]:', err);
        res.status(500).send('<h1>Erro interno na autenticação</h1>');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor web rodando na porta ${PORT}`));

client.login(BOT_TOKEN);
                          
