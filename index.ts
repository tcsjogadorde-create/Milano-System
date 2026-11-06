import { Client, GatewayIntentBits, Collection } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { startWebServer } from '../../src/web/server.js';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
}) as Client & { commands: Collection<string, any> };

client.commands = new Collection();

async function loadCommands() {
  const commandsPath = path.resolve(process.cwd(), 'src', 'commands');
  
  if (!fs.existsSync(commandsPath)) {
    console.log('[AVISO] Pasta src/commands não encontrada.');
    return;
  }

  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const fileUrl = pathToFileURL(filePath).href;
    
    const commandModule = await import(fileUrl);
    const command = commandModule.command;

    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      console.log(`[COMANDO CARREGADO] /${command.data.name}`);
    } else {
      console.log(`[AVISO] O comando em ${file} não tem a estrutura 'data' ou 'execute'.`);
    }
  }
}

client.once('ready', async () => {
  console.log(`[MILANO SYSTEM] Bot ligado com sucesso como ${client.user?.tag}!`);
  await loadCommands();
  
  // Inicia o servidor Express para processar as verificações OAuth2
  startWebServer(client);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.reply({ content: 'Ocorreu um erro ao executar este comando!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Ocorreu um erro ao executar este comando!', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
