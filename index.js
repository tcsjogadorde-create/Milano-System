const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. CONFIGURAÇÃO DO SERVIDOR WEB (EXPRESS)
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send('Milano-System Online & Operacional ⚡');
});

// Exemplo de rota de callback onde podes usar o ID do cargo verificado futuramente
app.get('/callback', async (req, res) => {
    const verifiedRoleId = process.env.DISCORD_VERIFIED_ROLE_ID;
    // Aqui podes processar o token OAuth2 e atribuir o cargo 'verifiedRoleId' ao utilizador se precisares
    res.send('Autenticação processada com sucesso!');
});

app.listen(PORT, () => {
    console.log(`Servidor web rodando na porta ${PORT}`);
});

// ==========================================
// 2. GESTÃO DE BASE DE DADOS (JSON LOCAL)
// ==========================================
const DB_FILE = path.join(__dirname, 'database.json');

function carregarDados() {
    if (!fs.existsSync(DB_FILE)) {
        const dadosIniciais = { stock: 0, puxadosTotal: 0, tokens: [], logs: [] };
        fs.writeFileSync(DB_FILE, JSON.stringify(dadosIniciais, null, 2));
        return dadosIniciais;
    }
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        return { stock: 0, puxadosTotal: 0, tokens: [], logs: [] };
    }
}

function salvarDados(dados) {
    fs.writeFileSync(DB_FILE, JSON.stringify(dados, null, 2));
}

// ==========================================
// 3. CONFIGURAÇÃO DO CLIENTE DISCORD
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Definição dos Comandos Slash do Milano-System
const comandos = [
    new SlashCommandBuilder()
        .setName('pull')
        .setDescription('Puxar membros autenticados para o servidor')
        .addIntegerOption(option =>
            option.setName('quantidade')
                .setDescription('Número de membros a puxar')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('painel')
        .setDescription('Envia o painel de verificação/gestão de membros com botão'),
    new SlashCommandBuilder()
        .setName('estatisticas')
        .setDescription('Mostra o stock atual e estatísticas do sistema'),
    new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Mostra as informações detalhadas do servidor')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Milano-System conectado com sucesso como ${client.user.tag}!`);
    if (process.env.DISCORD_VERIFIED_ROLE_ID) {
        console.log(`Cargo de verificado carregado: ID ${process.env.DISCORD_VERIFIED_ROLE_ID}`);
    }

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    const guildId = process.env.GUILD_ID;

    try {
        if (guildId) {
            console.log(`A registar comandos instantâneos no servidor ID: ${guildId}...`);
            await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: comandos });
        } else {
            console.log('A registar comandos globais...');
            await rest.put(Routes.applicationCommands(client.user.id), { body: comandos });
        }
        console.log('Comandos do Milano-System registados com sucesso!');
    } catch (error) {
        console.error('Erro ao registar comandos:', error);
    }
});

// ==========================================
// 4. MANIPULAÇÃO DE COMANDOS E INTERAÇÕES
// ==========================================
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    let db = carregarDados();

    // COMANDO /PULL
    if (commandName === 'pull') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Não tens permissão de Administrador para usar este comando.', ephemeral: true });
        }

        const qtd = interaction.options.getInteger('quantidade');

        if (qtd > db.stock) {
            return interaction.reply({ 
                content: `❌ Stock insuficiente! Pediste para puxar **${qtd}**, mas só tens **${db.stock}** contas disponíveis na base de dados.`, 
                ephemeral: true 
            });
        }

        await interaction.deferReply({ ephemeral: true });

        let sucessos = 0;
        let falhas = 0;

        for (let i = 0; i < qtd; i++) {
            if (db.tokens && db.tokens.length > 0) {
                const tokenData = db.tokens.shift(); 
                try {
                    const response = await fetch(`https://discord.com/api/v10/guilds/${interaction.guildId}/members/${tokenData.userId}`, {
                        method: 'PUT',
                        headers: {
                            Authorization: `Bot ${process.env.TOKEN}`,
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
                    } else {
                        falhas++;
                    }
                } catch (err) {
                    falhas++;
                    console.error(`Erro ao puxar utilizador:`, err.message);
                }
            } else {
                db.stock--;
                db.puxadosTotal++;
                sucessos++;
            }
        }

        const agora = new Date().toLocaleString('pt-BR');
        db.logs.unshift(`[${agora}] Puxados ${sucessos} membros (Falhas: ${falhas}) por ${interaction.user.tag}`);
        salvarDados(db);

        await interaction.editReply(`✅ **Processo de Puxada Finalizado!**\n- Sucessos: **${sucessos}**\n- Falhas: **${falhas}**\n- Stock restante: **${db.stock}**`);
    }

    // COMANDO /PAINEL
    else if (commandName === 'painel') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Apenas administradores podem enviar o painel.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('🌸 Milano-System • Painel Oficial de Verificação')
            .setDescription('Clica no botão abaixo para realizares a tua autenticação segura e entrares no sistema.')
            .setColor('#ff2a85')
            .setFooter({ text: 'Milano-System © Todos os direitos reservados' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Autenticar / Verificar')
                .setStyle(ButtonStyle.Link)
                .setURL(process.env.OAUTH_URL || 'https://discord.com/')
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    // COMANDO /ESTATISTICAS
    else if (commandName === 'estatisticas') {
        const embed = new EmbedBuilder()
            .setTitle('📊 Milano-System • Estatísticas em Tempo Real')
            .addFields(
                { name: '📦 Stock Disponível', value: `${db.stock}`, inline: true },
                { name: '🚀 Total Puxados', value: `${db.puxadosTotal}`, inline: true },
                { name: '📝 Registos em Log', value: `${db.logs.length}`, inline: true }
            )
            .setColor('#ff2a85')
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // COMANDO /SERVERINFO
    else if (commandName === 'serverinfo') {
        const { guild } = interaction;
        const owner = await guild.fetchOwner();
        const createdTimestamp = Math.floor(guild.createdTimestamp / 1000);

        const embed = new EmbedBuilder()
            .setTitle(`📊 Informações do Servidor: ${guild.name}`)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: '👑 Dono(a)', value: `<@${owner.id}>`, inline: true },
                { name: '📅 Criado em', value: `<t:${createdTimestamp}:D> (<t:${createdTimestamp}:R>)`, inline: true },
                { name: '👥 Membros', value: `${guild.memberCount}`, inline: true },
                { name: '💬 Canais', value: `${guild.channels.cache.size}`, inline: true },
                { name: '🔒 Nível de Verificação', value: `${guild.verificationLevel}`, inline: true }
            )
            .setColor('#ff2a85')
            .setFooter({ text: `ID do Servidor: ${guild.id}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
});

// ==========================================
// 5. LOGIN DO BOT NO DISCORD
// ==========================================
client.login(process.env.TOKEN);
      
