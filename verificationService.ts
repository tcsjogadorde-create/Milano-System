import { db } from '../db/prisma.js';
import { Client, Guild } from 'discord.js';

export async function processVerification(client: Client, userId: string, accessToken: string, refreshToken: string, guildId: string, verifiedRoleId: string) {
  try {
    // 1. Guarda ou atualiza o utilizador e os tokens OAuth2 no PostgreSQL
    const user = await db.user.upsert({
      where: { id: userId },
      update: { updatedAt: new Date() },
      create: {
        id: userId,
        username: 'DiscordUser', // Atualizado posteriormente via API do Discord se necessário
      },
    });

    await db.oAuthToken.upsert({
      where: { userId },
      update: { accessToken, refreshToken, updatedAt: new Date() },
      create: {
        userId,
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias de validade padrão
        scope: 'identify guilds.join',
      },
    });

    // 2. Atribui o cargo automático no servidor do Discord
    const guild = await client.guilds.fetch(guildId);
    if (!guild) throw new Error('Servidor não encontrado.');

    const member = await guild.members.fetch(userId);
    if (!member) throw new Error('Membro não encontrado no servidor.');

    if (verifiedRoleId) {
      await member.roles.add(verifiedRoleId);
    }

    // 3. Regista o sucesso da verificação na tabela de status
    await db.verification.upsert({
      where: { userId },
      update: { status: 'VERIFIED', verifiedAt: new Date(), roleAssigned: true },
      create: {
        userId,
        status: 'VERIFIED',
        roleAssigned: true,
      },
    });

    console.log(`[VERIFICAÇÃO] Utilizador ${userId} verificado com sucesso e cargo atribuído!`);
    return { success: true };
  } catch (error) {
    console.error('[ERRO NA VERIFICAÇÃO]', error);
    return { success: false, error };
  }
}
