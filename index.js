const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios'); // Caso uses axios para chamadas HTTP, podes usar node-fetch ou nativo

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

// Rota de callback OAuth2 (Onde os utilizadores autenticados entram para cair na base de tokens/puxada)
app.get('/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('❌ Código de autorização não fornecido.');
    }

    try {
        // Aqui podes colocar a lógica de troca do code por access_token e guardar no banco/JSON
        // Exemplo simplificado de resposta ao utilizador:
        res.send(`
            <html>
                <head><title>Milano-System - Verificado</title></head>
                <body style="background: #111; color: #fff; text-align: center; font-family: sans-serif; padding-top: 50px;">
                    <h1>✅ Verificação Concluída com Sucesso!</h1>
                    <p>Já podes fechar esta janela e voltar ao Discord.</p>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Erro no callback OAuth2:', error);
        res.status(500).send('❌ Ocorreu um erro ao processar a tua autenticação.');
    }
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

// Definição dos Comandos Slash do Sistema
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
        .setDescription('Mostra o stock atual e estatísticas do sistema')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Bot conectado com sucesso como ${client.user.tag}!`);

    // Registar Comandos Globais no Discord de forma automática
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        console.log('A atualizar comandos de barra (/) do Milano-System...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: comandos },
        );
        console.log('Comandos de barra registados com sucesso no Discord!');
    } catch (error) {
        console.error('Erro ao registar comandos slash:', error);
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

        // Lógica de injeção dos membros via API do Discord (PUT /guilds/{guild.id}/members/{user.id})
        // Certifica-te de ter os access_tokens guardados no array db.tokens se necessário
        for (let i = 0; i < qtd; i++) {
            if (db.tokens && db.tokens.length > 0) {
                const tokenData = db.tokens.shift(); // retira o primeiro token do stock
                try {
                    await axios.put(
                        `https://discord.com/api/v10/guilds/${interaction.guildId}/members/${tokenData.userId}`,
                        {
                            access_token: tokenData.accessToken,
                            roles: tokenData.roles || [] // Cargos opcionais a atribuir na entrada
                        },
                        {
                            headers: {
                                Authorization: `Bot ${process.env.TOKEN}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    sucessos++;
                    db.puxadosTotal++;
                } catch (err) {
                    falhas++;
                    console.error(`Erro ao puxar utilizador:`, err.response?.data || err.message);
                }
            } else {
                // Caso o stock esteja controlado apenas pelo contador numérico básico
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

        // Botão de redirecionamento para o OAuth2 Link
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Autenticar / Verificar')
                .setStyle(ButtonStyle.Link)
                .setURL(process.env.OAUTH_URL || 'https://discord.com/api/oauth2/authorize?client_id=SEU_CLIENT_ID&redirect_uri=SUA_URL_CALLBACK&response_type=code&scope=identify+guilds.join')
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
});

// ==========================================
// 5. LOGIN DO BOT NO DISCORD
// ==========================================
client.login(process.env.TOKEN);
      
