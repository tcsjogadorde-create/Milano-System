import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

export const command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Responde com Pong e verifica a latência do Milano System!'),
  
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply({ content: '🏓 Pong! O Milano System está online e operacional.', ephemeral: true });
  },
};
