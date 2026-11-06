import express from 'express';
import axios from 'axios';
import { processVerification } from '../services/verificationService.js';
import { Client } from 'discord.js';

export function startWebServer(client: Client) {
  const app = express();
  const PORT = process.env.PORT || 3001;

  app.get('/api/auth/callback', async (req, res) => {
    const code = req.query.code as string;

    if (!code) {
      return res.status(400).send('<h1>Erro</h1><p>Código de autorização do Discord não encontrado.</p>');
    }

    try {
      // 1. Troca o código temporário por tokens de acesso do Discord
      const tokenResponse = await axios.post(
        'https://discord.com/api/oauth2/token',
        new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID || '',
          client_secret: process.env.DISCORD_CLIENT_SECRET || '',
          grant_type: 'authorization_code',
          code,
          redirect_uri: process.env.DISCORD_REDIRECT_URI || '',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const { access_token, refresh_token } = tokenResponse.data;

      // 2. Obtém os dados do utilizador autenticado na API do Discord
      const userResponse = await axios.get('https://discord.com/api/users/@me', {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      const userId = userResponse.data.id;

      // ID do servidor e do cargo verificado (podes ajustar ou puxar de variáveis de ambiente)
      const guildId = process.env.DISCORD_GUILD_ID || 'SEU_SERVER_ID';
      const verifiedRoleId = process.env.DISCORD_VERIFIED_ROLE_ID || 'SEU_CARGO_ID';

      // 3. Processa a verificação, guarda no banco e atribui o cargo
      const result = await processVerification(client, userId, access_token, refresh_token, guildId, verifiedRoleId);

      if (result.success) {
        return res.send(`
          <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px; background-color: #1a1a1a; color: #fff; padding: 40px; border-radius: 10px; width: 500px; margin-left: auto; margin-right: auto;">
            <h1 style="color: #43b581;">Verificação Concluída com Sucesso!</h1>
            <p>A tua conta foi validada pelo Milano System. Já podes voltar ao Discord.</p>
          </div>
        `);
      } else {
        return res.status(500).send('<h1>Erro</h1><p>Ocorreu um erro ao atribuir o teu cargo ou guardar os dados.</p>');
      }
    } catch (error) {
      console.error('[ERRO OAUTH2 CALLBACK]', error);
      return res.status(500).send('<h1>Erro interno</h1><p>Falha na comunicação com a API do Discord.</p>');
    }
  });

  app.listen(PORT, () => {
    console.log(`[MILANO SYSTEM] Servidor web de autenticação a correr na porta ${PORT}`);
  });
}
