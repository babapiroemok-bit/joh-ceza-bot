// ── WATCHDOG — Otomatik yeniden başlatma sistemi ──────────────────────────────
const { EmbedBuilder, ChannelType } = require('discord.js');

const MAX_RESTARTS    = 10;
const RESTART_DELAY   = 5000;
const RESET_AFTER     = 60000;
const CEZA_LOG_CH_ID  = '1495454740908347464';

let restartCount    = 0;
let lastRestartTime = 0;

async function sendCrashLog(client, error, guildId) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const logCh = guild.channels.cache.get(CEZA_LOG_CH_ID) ||
      guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name.toLowerCase().includes('ceza-log'));
    if (!logCh) return;
    await logCh.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('⚠️ Ceza Bot — Hata Bildirimi')
          .setDescription('Bot bir hata ile karşılaştı ve yeniden bağlanmaya çalışıyor.')
          .setColor(0xFF8C00)
          .addFields(
            { name: '❌ Hata',            value: String(error?.message ?? error).slice(0,1000), inline: false },
            { name: '🔄 Yeniden Deneme', value: `${restartCount}/${MAX_RESTARTS}`,              inline: true },
            { name: '⏱️ Tarih',           value: `<t:${Math.floor(Date.now()/1000)}:F>`,        inline: true },
          )
          .setFooter({ text: 'Watchdog Sistemi — Otomatik Kurtarma' })
          .setTimestamp(),
      ],
    });
  } catch {}
}

async function sendRestartLog(client, guildId) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const logCh = guild.channels.cache.get(CEZA_LOG_CH_ID) ||
      guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name.toLowerCase().includes('ceza-log'));
    if (!logCh) return;
    await logCh.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('✅ Ceza Bot — Yeniden Bağlandı')
          .setDescription('Bot başarıyla yeniden bağlandı ve aktif.')
          .setColor(0x57F287)
          .addFields({ name: '⏱️ Tarih', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true })
          .setTimestamp(),
      ],
    });
  } catch {}
}

function setupWatchdog(client, TOKEN, GUILD_ID) {
  client.on('error', async (error) => {
    console.error('[WATCHDOG] Client error:', error.message);
    await sendCrashLog(client, error, GUILD_ID);
  });

  client.on('shardDisconnect', async (event, shardId) => {
    console.warn(`[WATCHDOG] Shard ${shardId} kesildi. Kod: ${event.code}`);
    if (event.code === 1000) return;
    await attemptReconnect(client, TOKEN, GUILD_ID);
  });

  client.on('shardReconnecting', (shardId) => {
    console.log(`[WATCHDOG] Shard ${shardId} yeniden bağlanıyor...`);
  });

  client.on('shardResume', async (shardId) => {
    console.log(`[WATCHDOG] Shard ${shardId} geri döndü.`);
    await sendRestartLog(client, GUILD_ID);
    setTimeout(() => { restartCount = 0; }, RESET_AFTER);
  });

  process.on('unhandledRejection', async (reason) => {
    console.error('[WATCHDOG] Unhandled Rejection:', reason);
    await sendCrashLog(client, reason, GUILD_ID);
  });

  process.on('uncaughtException', async (error) => {
    console.error('[WATCHDOG] Uncaught Exception:', error.message);
    await sendCrashLog(client, error, GUILD_ID);
    await attemptReconnect(client, TOKEN, GUILD_ID);
  });

  setInterval(() => {
    if (client.ws.ping === -1) {
      console.warn('[WATCHDOG] Ping -1, yeniden bağlanılıyor...');
      attemptReconnect(client, TOKEN, GUILD_ID);
    } else {
      console.log(`[WATCHDOG] Ping: ${client.ws.ping}ms ✅`);
    }
  }, 30000);

  console.log('[WATCHDOG] ✅ Watchdog sistemi aktif.');
}

async function attemptReconnect(client, TOKEN, GUILD_ID) {
  const now = Date.now();
  if (now - lastRestartTime < RESTART_DELAY) return;
  if (restartCount >= MAX_RESTARTS) {
    console.error('[WATCHDOG] Max deneme aşıldı. Process yeniden başlatılıyor...');
    process.exit(1);
  }
  lastRestartTime = now;
  restartCount++;
  console.log(`[WATCHDOG] Deneme ${restartCount}/${MAX_RESTARTS}...`);
  await new Promise((r) => setTimeout(r, RESTART_DELAY));
  try {
    await client.login(TOKEN);
    console.log('[WATCHDOG] ✅ Yeniden bağlandı!');
  } catch (e) {
    console.error('[WATCHDOG] Başarısız:', e.message);
    process.exit(1);
  }
}

module.exports = { setupWatchdog };
