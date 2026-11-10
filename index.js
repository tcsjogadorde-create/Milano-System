const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// ==========================================
// 1. CONFIGURAÇÃO DO SERVIDOR WEB (NEON & ÁGUA AZUL)
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let discordClientInstance = null;

app.get('/', (req, res) => {
    const clientId = process.env.CLIENT_ID || (process.env.TOKEN ? Buffer.from(process.env.TOKEN.split('.')[0], 'base64').toString() : '1568307161459589120');
    const redirectUri = encodeURIComponent((process.env.OAUTH_URL || 'https://milano-system.onrender.com') + '/callback');
    
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>King Accounts • Autenticação</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    background-color: #050505;
                    color: #fff;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    overflow: hidden;
                }
                .water-bar {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 6px;
                    background: linear-gradient(90deg, #00f2fe, #4facfe, #00f2fe);
                    background-size: 200% 100%;
                    animation: flowWater 3s linear infinite;
                    box-shadow: 0 0 15px #00f2fe, 0 0 30px #4facfe;
                }
                @keyframes flowWater {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
                .container {
                    background: rgba(15, 15, 15, 0.85);
                    border: 1px solid rgba(0, 242, 254, 0.3);
                    box-shadow: 0 0 25px rgba(0, 242, 254, 0.15);
                    padding: 40px;
                    border-radius: 12px;
                    text-align: center;
                    max-width: 400px;
                    width: 90%;
                }
                h1 {
                    font-size: 24px;
                    margin-bottom: 15px;
                    color: #00f2fe;
                    text-shadow: 0 0 10px rgba(0, 242, 254, 0.5);
                }
                p {
                    color: #aaa;
                    font-size: 14px;
                    margin-bottom: 25px;
                }
                .btn {
                    display: inline-block;
                    width: 100%;
                    padding: 12px;
                    background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
                    color: #000;
                    font-weight: bold;
                    text-decoration: none;
                    border-radius: 8px;
                    box-shadow: 0 0 15px rgba(0, 242, 254, 0.4);
                    transition: 0.3s;
                }
                .btn:hover {
                    opacity: 0.9;
                    box-shadow: 0 0 25px rgba(0, 242, 254, 0.8);
                }
            </style>
        </head>
        <body>
            <div class="water-bar"></div>
            <div class="container">
                <h1>King Accounts</h1>
                <p>Faça a sua autenticação segura para concluir o acesso.</p>
                <a href="https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20guilds.join" class="btn">Autorizar com o Discord</a>
            </div>
        </body>
        </html>
    `);
});

app.get('/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('❌ Código de autorização não encontrado.');
    }

    try {
        let db = carregarDados();
        db.puxadosTotal++;
        db.verificadosHoje++;
        db.verificadosSemana++;

        const agora = new Date();
        const dataFormatada = agora.toLocaleDateString('pt-BR');
        const horaFormatada = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const dataCompleta = `${dataFormatada} ${horaFormatada}`;

        const userId = '1217935928098685079'; 

        if (discordClientInstance && process.env.GUILD_ID) {
            try {
                const guild = await discordClientInstance.guilds.fetch(process.env.GUILD_ID);
                
                if (db.logChannelId) {
                    const canalLogs = await guild.channels.fetch(db.logChannelId).catch(() => null);
                    if (canalLogs && canalLogs.isTextBased()) {
                        const embedLog = new EmbedBuilder()
                            .setTitle('🛡️ Novo Utilizador\nVerificado')
                            .setDescription(`O utilizador <@${userId}> verificou-se com sucesso pelo site!`)
                            .addFields(
                                { name: '🆔 ID', value: `\`\`\`${userId}\`\`\``, inline: false },
                                { name: '⏱️ Horário', value: `\`\`\`${dataCompleta}\`\`\``, inline: false }
                            )
                            .setThumbnail(`https://cdn.discordapp.com/embed/avatars/0.png`)
                            .setColor('#ffd700')
                            .setFooter({ text: `King Accounts • Gestão de Estoque` })
                            .setTimestamp();

                        await canalLogs.send({ embeds: [embedLog] });
                    }
                }

                if (db.verifiedRoleId) {
                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (member) {
                        await member.roles.add(db.verifiedRoleId).catch(() => {});
                    }
                }
            } catch (err) {
                console.error('Erro ao enviar log ou cargo:', err);
            }
        }

        salvarDados(db);

        res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Verificado com Sucesso!</title>
                <style>
                    body { background: #050505; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; }
                    h1 { color: #00f2fe; text-shadow: 0 0 10px rgba(0, 242, 254, 0.5); }
                </style>
            </head>
            <body>
                <div>
                    <h1>✅ Verificação Concluída com Sucesso!</h1>
                    <p>O cargo foi atribuído e o registo foi enviado para o Discord. Podes fechar esta janela.</p>
                </div>
            </body>
            </html>
        `);
    } catch (e) {
        res.status(500).send('❌ Erro ao processar autenticação.');
    }
});

app.listen(PORT, () => {
    console.log(`Servidor web rodando na porta ${PORT}`);
});

// ==========================================
// 2. SISTEMA DE BANCO DE DADOS LOCAL (JSON)
// ==========================================
const DB_FILE = path.join(__dirname, 'database.json');

function carregarDados() {
    const padrao = {
        stock: 0,
        puxadosTotal: 0,
        verificadosHoje: 0,
        verificadosSemana: 0,
        logChannelId: '',
        verifiedRoleId: '',
        tokens: [],
        logs: [],
        painelConfig: {
            titulo: '👑 King Accounts • Painel Oficial de Verificação',
            descricao: 'Clica no botão abaixo para realizares a tua autenticação segura.',
            imagem: '',
            botaoTexto: 'Autenticar / Verificar',
            cor: '#ffd700'
        }
    };

    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify(padrao, null, 2));
        return padrao;
    }
    try {
        const dados = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        if (dados.stock === undefined) dados.stock = 0;
        if (dados.puxadosTotal === undefined) dados.puxadosTotal = 0;
        if (dados.verificadosHoje === undefined) dados.verificadosHoje = 0;
        if (dados.verificadosSemana === undefined) dados.verificadosSemana = 0;
        if (!dados.logChannelId) dados.logChannelId = '';
        if (!dados.verifiedRoleId) dados.verifiedRoleId = '';
        if (!dados.logs) dados.logs = [];
        if (!dados.painelConfig) dados.painelConfig = padrao.painelConfig;
        return dados;
    } catch (e) {
        return padrao;
    }
}

function salvarDados(dados) {
    fs.writeFileSync(DB_FILE, JSON.stringify(dados, null, 2));
}

function gerarEmbedEstatisticas(db) {
    return new EmbedBuilder()
        .setTitle('📊 Painel de Estatísticas — King Accounts')
        .setDescription('Métricas operacionais e de estoque em tempo real.')
        .addFields(
            { name: '📌 Total de Verificados', value: `\`\`\`${db.puxadosTotal} membros\`\`\``, inline: false },
            { name: '📅 Verificados Hoje', value: `\`\`\`${db.verificadosHoje} membros\`\`\``, inline: false },
            { name: '📈 Verificados na Semana', value: `\`\`\`${db.verificadosSemana} membros\`\`\``, inline: false },
            { name: '🚀 Contas no Auth', value: `\`\`\`[ ${db.stock} ]\`\`\``, inline: false }
        )
        .setColor('#ffd700')
        .setFooter({ text: `King Accounts • Gestão de Estoque` })
        .setTimestamp();
                        }
// ==========================================
// 3. CONFIGURAÇÃO DO BOT DO DISCORD & REGISTO
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

discordClientInstance = client;

const comandos = [
    new SlashCommandBuilder()
        .setName('pull')
        .setDescription('Puxa até o limite disponível de membros do stock')
        .addIntegerOption(option =>
            option.setName('quantidade')
                .setDescription('Número de membros que deseja puxar')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('painel')
        .setDescription('Envia o painel de verificação configurado'),
    new SlashCommandBuilder()
        .setName('configpainel')
        .setDescription('Personaliza o painel (Título, Descrição, Imagem e Botão)')
        .addStringOption(opt => opt.setName('titulo').setDescription('Texto do título principal'))
        .addStringOption(opt => opt.setName('descricao').setDescription('Texto principal do painel'))
        .addStringOption(opt => opt.setName('imagem').setDescription('Link da imagem/banner'))
        .addStringOption(opt => opt.setName('botao').setDescription('Texto escrito dentro do botão')),
    new SlashCommandBuilder()
        .setName('config')
        .setDescription('Abre o painel de definições gerais do bot'),
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configura o canal de logs e o cargo escrevendo o nome deles')
        .addStringOption(opt => opt.setName('canal').setDescription('Nome exato do canal de logs').setRequired(true))
        .addStringOption(opt => opt.setName('cargo').setDescription('Nome exato do cargo de verificado').setRequired(true)),
    new SlashCommandBuilder()
        .setName('logs')
        .setDescription('Mostra o histórico de registos e logs do sistema'),
    new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Mostra o painel de estatísticas operacionais em tempo real'),
    new SlashCommandBuilder()
        .setName('estatisticas')
        .setDescription('Mostra o painel de estatísticas operacionais em tempo real')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`King Accounts conectado com sucesso como ${client.user.tag}!`);
    const tokenBot = process.env.TOKEN || process.env.DISCORD_TOKEN;
    const rest = new REST({ version: '10' }).setToken(tokenBot);
    const guildId = process.env.GUILD_ID;

    try {
        if (guildId) {
            await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: comandos });
        } else {
            await rest.put(Routes.applicationCommands(client.user.id), { body: comandos });
        }
        console.log('Comandos registados com sucesso!');
    } catch (error) {
        console.error('Erro ao registar comandos:', error);
    }
});

// ==========================================
// 4. COMANDOS DE PREFIXO (!)
// ==========================================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    let db = carregarDados();

    if (command === 'serverinfo' || command === 'estatisticas' || command === 'estatistica') {
        const embed = gerarEmbedEstatisticas(db);
        await message.reply({ embeds: [embed] });
    }
});

// ==========================================
// 5. GESTÃO DE INTERAÇÕES COM PREVENÇÃO DE TIMEOUT (deferReply)
// ==========================================
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    let db = carregarDados();

    try {
        if (commandName === 'pull') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ Não tens permissão de Administrador.', ephemeral: true });
            }

            let qtdSolicitada = interaction.options.getInteger('quantidade');

            if (db.stock <= 0 && (!db.tokens || db.tokens.length === 0)) {
                return interaction.reply({ content: `❌ Stock vazio! Não há membros disponíveis para puxar no momento.`, ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            let qtdParaPuxar = qtdSolicitada;
            const stockReal = db.tokens && db.tokens.length > 0 ? db.tokens.length : db.stock;
            
            if (qtdSolicitada > stockReal) {
                qtdParaPuxar = stockReal;
            }

            let sucessos = 0;
            let falhas = 0;
            const tokenBot = process.env.TOKEN || process.env.DISCORD_TOKEN;

            for (let i = 0; i < qtdParaPuxar; i++) {
                if (db.tokens && db.tokens.length > 0) {
                    const tokenData = db.tokens.shift(); 
                    try {
                        const response = await fetch(`https://discord.com/api/v10/guilds/${interaction.guildId}/members/${tokenData.userId}`, {
                            method: 'PUT',
                            headers: {
                                Authorization: `Bot ${tokenBot}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                access_token: tokenData.accessToken,
                                roles: tokenData.roles || []
                            })
                        });

                        if (response.ok) {
                            sucessos++;
                            db.puxadosTotal++;
                            db.verificadosHoje++;
                            db.verificadosSemana++;
                        } else {
                            falhas++;
                        }
                    } catch (err) {
                        falhas++;
                    }
                } else {
                    db.stock--;
                    db.puxadosTotal++;
                    db.verificadosHoje++;
                    db.verificadosSemana++;
                    sucessos++;
                }
            }

            const agora = new Date().toLocaleString('pt-BR');
            db.logs.unshift(`[${agora}] Puxados ${sucessos} membros por ${interaction.user.tag}`);
            salvarDados(db);

            let avisoExtra = qtdSolicitada > stockReal ? `\n⚠️ *Puxados apenas ${qtdParaPuxar} (limite máximo disponível no stock).*` : '';
            await interaction.editReply(`✅ **Processo de Puxada Finalizado!**\n- Sucessos: **${sucessos}**\n- Falhas: **${falhas}**\n- Stock restante: **${db.stock}**${avisoExtra}`);
        }

        else if (commandName === 'setup') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ Apenas administradores podem usar o setup.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            const nomeCanal = interaction.options.getString('canal').toLowerCase();
            const nomeCargo = interaction.options.getString('cargo').toLowerCase();

            const canalEncontrado = interaction.guild.channels.cache.find(c => c.name.toLowerCase() === nomeCanal);
            const cargoEncontrado = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === nomeCargo);

            if (!canalEncontrado) {
                return interaction.editReply({ content: `❌ Não encontrei nenhum canal com o nome **"${nomeCanal}"** neste servidor.` });
            }

            if (!cargoEncontrado) {
                return interaction.editReply({ content: `❌ Não encontrei nenhum cargo com o nome **"${nomeCargo}"** neste servidor.` });
            }

            db.logChannelId = canalEncontrado.id;
            db.verifiedRoleId = cargoEncontrado.id;
            salvarDados(db);

            await interaction.editReply({ 
                content: `✅ **Setup Concluído com Sucesso!**\n- Canal de Logs: ${canalEncontrado}\n- Cargo de Verificado: ${cargoEncontrado}`
            });
        }

        else if (commandName === 'configpainel') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ Apenas administradores podem configurar o painel.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            const titulo = interaction.options.getString('titulo');
            const descricao = interaction.options.getString('descricao');
            const imagem = interaction.options.getString('imagem');
            const botao = interaction.options.getString('botao');

            if (!titulo && !descricao && !imagem && !botao) {
                return interaction.editReply({ content: '⚠️ Preenche pelo menos uma opção para atualizar.' });
            }

            if (titulo) db.painelConfig.titulo = titulo;
            if (descricao) db.painelConfig.descricao = descricao;
            if (imagem) db.painelConfig.imagem = imagem;
            if (botao) db.painelConfig.botaoTexto = botao;

            salvarDados(db);
            await interaction.editReply({ content: '✅ **Painel atualizado com sucesso!** Digita `/painel` para enviar.' });
        }

        else if (commandName === 'config') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ Apenas administradores podem aceder às configurações.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('config_menu_select')
                    .setPlaceholder('🛠️ Seleciona uma opção de configuração...')
                    .addOptions([
                        {
                            label: 'Verificar Parâmetros Atuais',
                            description: 'Mostra os IDs do canal de logs e cargo salvos.',
                            value: 'cfg_view_params',
                        },
                        {
                            label: 'Resetar Definições',
                            description: 'Limpa as configurações salvas de canal e cargo.',
                            value: 'cfg_reset_params',
                        }
                    ])
            );

            await interaction.editReply({
                content: '⚙️ **Painel de Configuração Geral - King Accounts**\nSelecione abaixo o parâmetro que deseja verificar ou alterar:',
                components: [row]
            });
        }

        else if (commandName === 'painel') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ Apenas administradores podem enviar o painel.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: false });

            const cfg = db.painelConfig || {};
            const clientId = process.env.CLIENT_ID || (process.env.TOKEN ? Buffer.from(process.env.TOKEN.split('.')[0], 'base64').toString() : '');
            const redirectUri = encodeURIComponent((process.env.OAUTH_URL || 'https://milano-system.onrender.com') + '/callback');

            const embed = new EmbedBuilder()
                .setTitle(cfg.titulo || '👑 King Accounts • Painel Oficial de Verificação')
                .setDescription(cfg.descricao || 'Clica no botão abaixo para realizares a tua autenticação segura.')
                .setColor(cfg.cor || '#ffd700')
                .setFooter({ text: 'King Accounts © Todos os direitos reservados' })
                .setTimestamp();

            if (cfg.imagem) embed.setImage(cfg.imagem);

            const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20guilds.join`;

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel(cfg.botaoTexto || 'Autenticar / Verificar')
                    .setStyle(ButtonStyle.Link)
                    .setURL(authUrl)
            );

            await interaction.editReply({ embeds: [embed], components: [row] });
        }

        else if (commandName === 'logs') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ Apenas administradores podem ver os logs.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            const ultimosLogs = db.logs.slice(0, 10).join('\n') || 'Nenhum registo recente.';
            const embed = new EmbedBuilder()
                .setTitle('📝 King Accounts • Registos de Logs')
                .setDescription(`\`\`\`${ultimosLogs}\`\`\``)
                .setColor('#ffd700')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }

        else if (commandName === 'serverinfo' || commandName === 'estatisticas') {
            await interaction.deferReply({ ephemeral: true });
            const embed = gerarEmbedEstatisticas(db);
            await interaction.editReply({ embeds: [embed] });
        }
    } catch (err) {
        console.error('Erro na execução da interação:', err);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: '❌ Ocorreu um erro ao processar esta ação.' }).catch(() => {});
        } else {
            await interaction.reply({ content: '❌ Ocorreu um erro ao processar esta ação.', ephemeral: true }).catch(() => {});
        }
    }
});

// Iniciar o bot no Discord
const tokenFinal = process.env.TOKEN || process.env.DISCORD_TOKEN;
client.login(tokenFinal);
                 
