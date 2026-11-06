const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const fetch = require('node-fetch');
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
let dynamicLogChannelId = '';

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
            .setName('setpuxados')
            .setDescription('Define ou incrementa a quantidade de membros puxados')
            .addIntegerOption(option => option.setName('quantidade').setDescription('Número de membros puxados').setRequired(true)),
        new SlashCommandBuilder()
            .setName('pull')
            .setDescription('Adiciona membros puxados ao sistema')
            .addIntegerOption(option => option.setName('quantidade').setDescription('Quantidade de membros puxados').setRequired(true))
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Comandos slash registados com sucesso!');
    } catch (error) {
        console.error('Erro ao registar comandos slash:', error);
    }
});

// Comandos por Prefixo (!serverinfo e !pull)
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content.startsWith('!serverinfo')) {
        const dbData = getData();
        const rows = dbData.verifications;
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

        let membrosPuxados = dbData.puxadosCount;
        let disponiveisGeral = membrosPuxados;

        const embedStats = new EmbedBuilder()
            .setTitle('📊 Painel de Estatísticas — Milano System')
            .setDescription('Métricas operacionais do servidor em tempo real.')
            .setColor('#00b37e')
            .addFields(
                { name: '📌 Total de Verificados', value: `\`\`\`fix\n${totalVerificacoes} membros\`\`\``, inline: true },
                { name: '📅 Verificados Hoje', value: `\`\`\`fix\n${hojeCount} membros\`\`\``, inline: true },
                { name: '📈 Verificados na Semana', value: `\`\`\`fix\n${semanaCount} membros\`\`\``, inline: true },
                { name: '🚀 Membros Já Puxados', value: `\`\`\`css\n[ ${membrosPuxados} ]\`\`\``, inline: true },
                { name: '🎯 Disponíveis no Geral', value: `\`\`\`css\n[ ${disponiveisGeral} ]\`\`\``, inline: true }
            )
            .setFooter({ text: 'Milano System • Consulta via !serverinfo' })
            .setTimestamp();

        return message.reply({ embeds: [embedStats] });
    }

    if (message.content.startsWith('!pull')) {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply({ content: '❌ Precisas de permissão de Administrador.' });
        }

        const args = message.content.split(' ');
        const qtd = parseInt(args[1]);

        if (isNaN(qtd)) {
            return message.reply({ content: '❌ Usa o formato correto, ex: `!pull 50`' });
        }

        const dbData = getData();
        dbData.puxadosCount += qtd;
        saveData(dbData);

        return message.reply({ content: `✅ **+${qtd}** membros adicionados aos puxados com sucesso! Total atual: \`${dbData.puxadosCount}\`` });
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

    if (interaction.commandName === 'setpuxados') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Precisas de permissão de Administrador.', ephemeral: true });
        }
        const qtd = interaction.options.getInteger('quantidade');
        const dbData = getData();
        dbData.puxadosCount = qtd;
        saveData(dbData);

        return interaction.reply({ content: `✅ **Membros puxados definidos com sucesso!** Novo total: \`${qtd}\``, ephemeral: true });
    }

    if (interaction.commandName === 'pull') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Precisas de permissão de Administrador.', ephemeral: true });
        }
        const qtd = interaction.options.getInteger('quantidade');
        const dbData = getData();
        dbData.puxadosCount += qtd;
        saveData(dbData);

        return interaction.reply({ content: `✅ **+${qtd}** membros adicionados aos puxados com sucesso! Total atual: \`${dbData.puxadosCount}\``, ephemeral: true });
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
            .setFooter({ text: 'Protegido por Milano System' })
            .setTimestamp();

        if (imagem) {
            embedPersonalizado.setImage(imagem);
        }

        const rowButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Verificar Conta')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Link)
                .setURL(oauthUrl)
        );

        await interaction.reply({ content: '✅ Painel personalizado criado com sucesso!', ephemeral: true });
        return interaction.channel.send({ embeds: [embedPersonalizado], components: [rowButton] });
    }

    if (interaction.commandName === 'painel') {
        const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify+email+guilds.join`;

        const embedPainel = new EmbedBuilder()
            .setTitle('🛡️ Sistema de Verificação - Milano')
            .setDescription('Clique no botão abaixo para verificar sua conta e liberar o acesso ao servidor.')
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
        const dbData = getData();
        const rows = dbData.verifications;
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

        let membrosPuxados = dbData.puxadosCount;
        let disponiveisGeral = membrosPuxados;

        const embedStats = new EmbedBuilder()
            .setTitle('📊 Painel de Estatísticas — Milano System')
            .setDescription('Acompanhe abaixo o desempenho operacional do sistema.')
            .setColor('#00b37e')
            .addFields(
                { name: '📌 Total de Verificados', value: `\`\`\`fix\n${totalVerificacoes} membros\`\`\``, inline: true },
                { name: '📅 Verificados Hoje', value: `\`\`\`fix\n${hojeCount} membros\`\`\``, inline: true },
                { name: '📈 Verificados na Semana', value: `\`\`\`fix\n${semanaCount} membros\`\`\``, inline: true },
                { name: '🚀 Membros Já Puxados', value: `\`\`\`css\n[ ${membrosPuxados} ]\`\`\``, inline: true },
                { name: '🎯 Disponíveis no Geral', value: `\`\`\`css\n[ ${disponiveisGeral} ]\`\`\``, inline: true }
            )
            .setFooter({ text: 'Milano System • Estatísticas' })
            .setTimestamp();

        await interaction.reply({ embeds: [embedStats] });
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
        const jaVerificado = dbData.verifications.some(v => v.user_id === userData.id);

        if (!jaVerificado) {
            const guild = client.guilds.cache.get(GUILD_ID);
            if (guild) {
                let member = guild.members.cache.get(userData.id) || await guild.members.fetch(userData.id).catch(() => null);

                if (member) {
                    if (dynamicRoleId) {
                        await member.roles.add(dynamicRoleId).catch(err => console.error('Erro ao dar cargo:', err));
                    }

                    dbData.verifications.push({ user_id: userData.id, username: userData.username, timestamp: new Date().toISOString() });
                    saveData(dbData);

                    if (dynamicLogChannelId) {
                        const logChannel = guild.channels.cache.get(dynamicLogChannelId);
                        if (logChannel) {
                            const avatarUrl = userData.avatar 
                                ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=128` 
                                : member.user.displayAvatarURL({ dynamic: true, size: 128 });

                            const logEmbed = new EmbedBuilder()
                                .setTitle('🛡️ **Novo Utilizador Verificado**')
                                .setDescription(`O utilizador **<@${userData.id}>** acabou de se verificar com sucesso!`)
                                .setThumbnail(avatarUrl)
                                .addFields(
                                    { name: '🆔 **ID do Utilizador**', value: `\`${userData.id}\``, inline: true },
                                    { name: '⏱️ **Horário**', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                                )
                                .setColor('#00b37e')
                                .setTimestamp();

                            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
                        }
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
                <title>Milano Auth</title>
                <style>
                    * { box-sizing: border-box; }
                    body { 
                        background-color: #080b10; 
                        color: #c9d1d9; 
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
                        display: flex; 
                        justify-content: center; 
                        align-items: center; 
                        min-height: 100vh; 
                        margin: 0; 
                        padding: 15px;
                    }
                    .card { 
                        background: #111622; 
                        padding: 35px 25px; 
                        border-radius: 16px; 
                        text-align: center; 
                        border: 1px solid #1f293d;
                        width: 100%; 
                        max-width: 400px; 
                        box-shadow: 0 15px 35px rgba(0, 0, 0, 0.8); 
                    }
                    .auth-icon-container {
                        width: 75px;
                        height: 75px;
                        background: radial-gradient(circle, rgba(31,111,235,0.2) 0%, rgba(17,22,34,1) 75%);
                        border: 1px solid rgba(88, 166, 255, 0.3);
                        border-radius: 50%;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        margin: 0 auto 15px auto;
                        box-shadow: 0 0 20px rgba(31, 111, 235, 0.25);
                    }
                    .auth-icon { font-size: 30px; }
                    .auth-brand {
                        font-size: 11px;
                        text-transform: uppercase;
                        letter-spacing: 2px;
                        color: #58a6ff;
                        font-weight: 700;
                        margin-bottom: 8px;
                    }
                    h2 { 
                        color: #ffffff; 
                        margin-bottom: 15px; 
                        font-size: 19px; 
                        font-weight: 600; 
                    }
                    .progress-container { 
                        width: 100%; 
                        background: #1a2233; 
                        border-radius: 10px; 
                        overflow: hidden; 
                        margin: 15px 0 25px 0; 
                        height: 7px; 
                    }
                    .progress-bar { 
                        width: 0%; 
                        height: 100%; 
                        background: linear-gradient(90deg, #1f6feb, #58a6ff); 
                        box-shadow: 0 0 10px rgba(88, 166, 255, 0.9);
                        transition: width 0.08s ease-out;
                        border-radius: 10px;
                    }
                    .steps-list {
                        text-align: left;
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                        margin-top: 10px;
                        padding: 0 5px;
                    }
                    .step-item {
                        display: flex;
                        align-items: center;
                        font-size: 13px;
                        color: #484f58;
                        transition: color 0.4s ease;
                    }
                    .step-dot {
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        background-color: #30363d;
                        margin-right: 12px;
                        transition: all 0.4s ease;
                    }
                    .step-item.active {
                        color: #58a6ff;
                        font-weight: 500;
                    }
                    .step-item.active .step-dot {
                        background-color: #58a6ff;
                        box-shadow: 0 0 8px #58a6ff;
                        transform: scale(1.25);
                    }
                    .step-item.done {
                        color: #3fb950;
                    }
                    .step-item.done .step-dot {
                        background-color: #3fb950;
                        box-shadow: 0 0 6px #3fb950;
                    }
                    .footer-note {
                        color: #484f58;
                        font-size: 12px;
                        margin-top: 30px;
                        border-top: 1px solid #1f293d;
                        padding-top: 15px;
                    }
                    .success-box, .already-box { display: none; text-align: center; }
                    .success-title { color: #3fb950; font-size: 20px; font-weight: 700; margin: 15px 0 10px 0; }
                    .already-title { color: #f85149; font-size: 20px; font-weight: 700; margin: 15px 0 10px 0; }
                    .box-text { color: #8b949e; font-size: 14px; line-height: 1.5; margin-bottom: 20px; }
                </style>
            </head>
            <body>
                <div class="card" id="loading-card">
                    <div class="auth-icon-container">
                        <div class="auth-icon">🛡️</div>
                    </div>
                    <div class="auth-brand">Milano Auth</div>
                    <h2 id="main-title">Conectando ao Discord...</h2>
                    
                    <div class="progress-container">
                        <div class="progress-bar" id="bar"></div>
                    </div>

                    <div class="steps-list">
                        <div class="step-item" id="step-1">
                            <div class="step-dot"></div>
                            <span>Conectando ao Discord</span>
                        </div>
                        <div class="step-item" id="step-2">
                            <div class="step-dot"></div>
                            <span>Validando autorização</span>
                        </div>
                        <div class="step-item" id="step-3">
                            <div class="step-dot"></div>
                            <span>Verificando usuário</span>
                        </div>
                        <div class="step-item" id="step-4">
                            <div class="step-dot"></div>
                            <span>Sincronizando acesso</span>
                        </div>
                    </div>

                    <div class="footer-note">Aguarde alguns segundos — não feche esta janela.</div>
                </div>

                <div class="card success-box" id="success-card">
                    <div class="auth-icon-container" style="border-color: rgba(63,185,80,0.4); box-shadow: 0 0 20px rgba(63,185,80,0.25);">
                        <div class="auth-icon">✅</div>
                    </div>
                    <div class="auth-brand" style="color: #3fb950;">Concluído</div>
                    <div class="success-title">VERIFICAÇÃO CONCLUÍDA</div>
                    <p class="box-text">Olá, <strong>${userData.username}</strong>! A tua conta foi verificada com sucesso e o cargo foi liberado.</p>
                    <div class="footer-note" style="margin-top: 15px;">Podes fechar esta aba e <strong>voltar ao Discord</strong>.</div>
                </div>

                <div class="card already-box" id="already-card">
                    <div class="auth-icon-container" style="border-color: rgba(248,81,73,0.4); box-shadow: 0 0 20px rgba(248,81,73,0.25);">
                        <div class="auth-icon">⚠️</div>
                    </div>
                    <div class="auth-brand" style="color: #f85149;">Aviso</div>
                    <div class="already-title">VOCÊ JÁ ESTÁ VERIFICADO</div>
                    <p class="box-text">Olá, <strong>${userData.username}</strong>! Detetámos que a tua conta já passou por este processo anteriormente.</p>
                    <div class="footer-note" style="margin-top: 15px;">Podes fechar esta aba e <strong>voltar ao Discord</strong>.</div>
                </div>

                <script>
                    const isAlreadyVerified = ${jaVerificado};
                    let width = 0;
                    const bar = document.getElementById('bar');
                    const loadingCard = document.getElementById('loading-card');
                    const successCard = document.getElementById('success-card');
                    const alreadyCard = document.getElementById('already-card');
                    const mainTitle = document.getElementById('main-title');

                    const s1 = document.getElementById('step-1');
                    const s2 = document.getElementById('step-2');
                    const s3 = document.getElementById('step-3');
                    const s4 = document.getElementById('step-4');

                    const interval = setInterval(() => {
                        if (width >= 100) {
                            clearInterval(interval);
                            loadingCard.style.display = 'none';
                            
                            if (isAlreadyVerified) {
                                alreadyCard.style.display = 'block';
                            } else {
                                successCard.style.display = 'block';
                            }
                        } else {
                            width++;
                            bar.style.width = width + '%';

                            if (width < 25) {
                                s1.className = "step-item active";
                                mainTitle.innerText = "Conectando ao Discord...";
                            } else if (width < 50) {
                                s1.className = "step-item done";
                                s2.className = "step-item active";
                                mainTitle.innerText = "Validando autorização...";
                            } else if (width < 75) {
                                s2.className = "step-item done";
                                s3.className = "step-item active";
                                mainTitle.innerText = "Verificando usuário...";
                            } else {
                                s3.className = "step-item done";
                                s4.className = "step-item active";
                                mainTitle.innerText = "Sincronizando acesso...";
                            }
                        }
                    }, 30);
                </script>
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
          
