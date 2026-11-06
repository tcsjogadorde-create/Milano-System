import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder,
  PermissionFlagsBits 
} from 'discord.js';

export const command = {
  data: new SlashCommandBuilder()
    .setName('verify-panel')
    .setDescription('Envia o painel oficial de verificação do Milano System.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = encodeURIComponent(process.env.DISCORD_REDIRECT_URI || '');
    
    // Link oficial de autorização OAuth2 do teu bot
    const oauthUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20guilds.join`;

    const embed = new EmbedBuilder()
      .setTitle('🛡️ Verificação de Segurança - MILANO SYSTEM')
      .setDescription(
        'Para obter acesso total aos canais e garantir a segurança do servidor, clica no botão abaixo para te verificares via OAuth2.'
      )
      .setColor('#2b2d31')
      .setFooter({ text: 'Milano System • Proteção Ativa' });

    const button = new ButtonBuilder()
      .setLabel('Verificar Conta')
      .setStyle(ButtonStyle.Link)
      .setURL(oauthUrl)
      .setEmoji('✅');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};
