const { Client, GatewayIntentBits, Collection } = require('discord.js');
const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();

// 1. Configuração da Base de Dados PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('Erro ao ligar à base de dados PostgreSQL:', err.stack);
    } else {
        console.log('Conexão com PostgreSQL estabelecida com sucesso!');
        release();
    }
});

// 2. Configuração do Bot Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();

client.once('ready', () => {
    console.log(`[BOT] Milano System online como ${client.user.tag}!`);
});

// Exemplo de captura/resposta a mensagens
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content === '!ping') {
        return message.reply('Pong! Milano System está operacional.');
    }
});

// 3. Servidor Web Express (Mantém o Render ativo e trata de APIs/Auth)
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.get('/', (req, res) => {
    res.send('Milano System Web API & Bot estão 100% online!');
});

// Rota de callback (OAuth2 / Verificação)
app.get('/api/auth/callback', (req, res) => {
    res.send('Autenticação processada com sucesso.');
});

app.listen(PORT, () => {
    console.log(`[WEB] Servidor a rodar na porta ${PORT}`);
});

// 4. Iniciar Sessão no Discord
if (!process.env.DISCORD_BOT_TOKEN) {
    console.error('ERRO: A variável DISCORD_BOT_TOKEN não está definida no Render!');
} else {
    client.login(process.env.DISCORD_BOT_TOKEN);
}
