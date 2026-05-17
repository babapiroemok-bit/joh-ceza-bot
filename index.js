const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const { setupWatchdog } = require('./watchdog');

const TOKEN          = process.env.CEZA_TOKEN;
const GUILD_ID       = process.env.GUILD_ID;
const CLIENT_ID      = '1505287686208880760';
const UST_ROL_ID     = '1505270476652413079';
const CEZA_LOG_CH_ID = '1495454740908347464';

const pendingPenalties = new Map();

// ── SLASH COMMANDS ────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('⚖️ Ceza panelini bu kanala kurar')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('yardim')
    .setDescription('📖 Ceza botunun tüm komutlarını gösterir'),
  new SlashCommandBuilder()
    .setName('ceza-listesi')
    .setDescription('📋 Bekleyen ceza taleplerini listeler')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName('durum')
    .setDescription('📊 Botun durumunu, ping ve uptime bilgisini gösterir'),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ Slash komutları kaydedildi.');
  } catch (e) {
    console.error('❌ Komut kaydı hatası:', e.message);
  }
}

// ── LOG HELPER ────────────────────────────
async function sendLog(guild, embed) {
  const fixed = guild.channels.cache.get(CEZA_LOG_CH_ID);
  if (fixed) await fixed.send({ embeds: [embed] }).catch(() => {});
  const extra = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name.toLowerCase().includes('ceza-log') && c.id !== CEZA_LOG_CH_ID
  );
  if (extra) await extra.send({ embeds: [embed] }).catch(() => {});
}

// ── READY ─────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Ceza Bot aktif: ${client.user.tag}`);
  console.log(`✅ Sunucu sayısı: ${client.guilds.cache.size}`);
  console.log(`✅ GUILD_ID: ${GUILD_ID}`);
  setupWatchdog(client, TOKEN, GUILD_ID);
});

// ── INTERACTION HANDLER ───────────────────
client.on('interactionCreate', async (interaction) => {

  // ── COMMANDS ──
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'durum') {
      const uptime = process.uptime();
      const h = Math.floor(uptime / 3600);
      const m = Math.floor((uptime % 3600) / 60);
      const s = Math.floor(uptime % 60);
      const embed = new EmbedBuilder()
        .setTitle('📊 Ceza Bot — Durum')
        .setColor(0x57F287)
        .addFields(
          { name: '🏓 Ping',              value: `${client.ws.ping}ms`,          inline: true },
          { name: '⏱️ Uptime',            value: `${h}sa ${m}dk ${s}sn`,         inline: true },
          { name: '⚖️ Bekleyen Cezalar',  value: `${pendingPenalties.size}`,     inline: true },
          { name: '🤖 Bot Tag',            value: client.user.tag,                inline: true },
          { name: '📡 Sunucu Sayısı',     value: `${client.guilds.cache.size}`,  inline: true },
          { name: '💚 Durum',              value: 'Online ✅',                    inline: true },
        )
        .setFooter({ text: 'JÖH Disiplin Sistemi v2.0 | Watchdog Aktif 🛡️' })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'yardim') {
      const embed = new EmbedBuilder()
        .setTitle('⚖️ JÖH Ceza Bot — Yardım')
        .setDescription('Aşağıda botun tüm komutları ve açıklamaları yer almaktadır.')
        .setColor(0xFF4444)
        .addFields(
          { name: '⚙️ Admin Komutları', value: '\u200b', inline: false },
          { name: '/panel',        value: 'Ceza panelini bu kanala kurar',                inline: true },
          { name: '/ceza-listesi', value: 'Bekleyen ceza taleplerini listeler',           inline: true },
          { name: '\u200b',        value: '\u200b',                                        inline: false },
          { name: '📖 Genel',      value: '\u200b',                                        inline: false },
          { name: '/yardim',       value: 'Bu yardım menüsünü gösterir',                  inline: true },
          { name: '\u200b',        value: '\u200b',                                        inline: false },
          { name: '🖱️ Panel Butonları (Üst Yönetim)', value: '\u200b',                   inline: false },
          { name: '🟡 Uyarı Ver',       value: 'Uyarı cezası uygular',                   inline: true },
          { name: '🟠 Sustur',          value: 'Susturma cezası uygular',                 inline: true },
          { name: '🔴 Geçici Ban',      value: 'Geçici ban cezası uygular',               inline: true },
          { name: '🔨 Kalıcı Ban',      value: 'Kalıcı ban cezası uygular',               inline: true },
          { name: '📉 Rütbe Düşür',     value: 'Rütbe düşürme cezası uygular',            inline: true },
          { name: '\u200b',             value: '\u200b',                                   inline: false },
          { name: '📋 Ceza Süreci', value: '\u200b',                                      inline: false },
          { name: '1️⃣ Panel butonu',   value: 'Kanıt + sebep formu açılır',               inline: false },
          { name: '2️⃣ Form doldur',    value: 'Özel ceza kanalı açılır',                  inline: false },
          { name: '3️⃣ Onay butonu',    value: 'Ceza log kanalına kaydedilir',             inline: false },
          { name: '\u200b',             value: '\u200b',                                   inline: false },
          { name: '📌 Log Kanalı', value: `<#${CEZA_LOG_CH_ID}>`, inline: false },
        )
        .setFooter({ text: 'JÖH Disiplin Sistemi v2.0 | Sadece Üst Yönetim' })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'panel') {
      const embed = new EmbedBuilder()
        .setTitle('⚖️ JÖH Ceza Yönetim Paneli')
        .setDescription(
          '**Jandarma Özel Harekat Disiplin Sistemi**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
          '🚔 **Ceza İşlemleri:**\n' +
          '> 🟡 **Uyarı** — Hafif ihlaller\n' +
          '> 🟠 **Susturma** — Konuşma ihlalleri\n' +
          '> 🔴 **Geçici Ban** — Ciddi ihlaller\n' +
          '> ⛔ **Kalıcı Ban** — Çok ciddi ihlaller\n' +
          '> 🔱 **Rütbe Düşürme** — Görev ihlali\n\n' +
          '⚠️ *Tüm cezalar kanıt ile birlikte kayıt altına alınır.*\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
        )
        .setColor(0xFF4444)
        .setFooter({ text: 'JÖH Disiplin Sistemi v2.0 | Sadece Üst Yönetim' })
        .setTimestamp();

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ceza_uyan').setLabel('⚠️ Uyarı Ver').setStyle(ButtonStyle.Secondary).setEmoji('🟡'),
        new ButtonBuilder().setCustomId('ceza_sustur').setLabel('🔇 Sustur').setStyle(ButtonStyle.Primary).setEmoji('🟠'),
        new ButtonBuilder().setCustomId('ceza_gban').setLabel('⏳ Geçici Ban').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ceza_ban').setLabel('⛔ Kalıcı Ban').setStyle(ButtonStyle.Danger).setEmoji('🔨'),
        new ButtonBuilder().setCustomId('ceza_rutbe').setLabel('🔱 Rütbe Düşür').setStyle(ButtonStyle.Secondary).setEmoji('📉'),
      );

      await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
      return interaction.reply({ content: '✅ Ceza paneli kuruldu!', ephemeral: true });
    }

    if (commandName === 'ceza-listesi') {
      if (pendingPenalties.size === 0) {
        return interaction.reply({ content: '✅ Şu an bekleyen ceza talebi yok.', ephemeral: true });
      }
      const embed = new EmbedBuilder()
        .setTitle('📋 Bekleyen Ceza Talepleri')
        .setColor(0xFF8C00)
        .setTimestamp();
      for (const [id, p] of pendingPenalties.entries()) {
        embed.addFields({ name: `${p.type.emoji} ${p.type.name}`, value: `🎯 ${p.hedef} | 👮 <@${p.yetkili}> | ID: \`${id.slice(-6)}\``, inline: false });
      }
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // ── BUTTONS ──
  if (interaction.isButton()) {
    const id = interaction.customId;
    const cezaTurleri = ['ceza_uyan','ceza_sustur','ceza_gban','ceza_ban','ceza_rutbe'];
    if (cezaTurleri.includes(id)) {
      if (!interaction.member.roles.cache.has(UST_ROL_ID))
        return interaction.reply({ content: '🚫 Bu paneli sadece **Üst Yönetim** kullanabilir.', ephemeral: true });
      await showPenaltyModal(interaction, id);
    } else if (id.startsWith('ceza_onayla_')) { await finalizePenalty(interaction); }
    else if (id.startsWith('ceza_iptal_'))   { await cancelPenalty(interaction); }
  }

  // ── MODALS ──
  if (interaction.isModalSubmit() && interaction.customId.startsWith('ceza_form_')) {
    await handlePenaltyForm(interaction);
  }
});

// ── PENALTY FUNCTIONS ─────────────────────
async function showPenaltyModal(interaction, typeId) {
  const typeNames = { ceza_uyan:'Uyarı', ceza_sustur:'Susturma', ceza_gban:'Geçici Ban', ceza_ban:'Kalıcı Ban', ceza_rutbe:'Rütbe Düşürme' };
  const modal = new ModalBuilder().setCustomId(`ceza_form_${typeId}`).setTitle(`⚖️ ${typeNames[typeId]} İşlemi`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hedef').setLabel('👤 Hedef Kişi (ID veya @kullanıcı)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sebep').setLabel('📋 Ceza Sebebi').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('kanit').setLabel('📸 Kanıt (Link veya açıklama)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sure').setLabel('⏱️ Süre (geçici işlemler için)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(50).setPlaceholder('Örn: 7 gün, 24 saat')),
  );
  await interaction.showModal(modal);
}

async function handlePenaltyForm(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const guild  = interaction.guild;
  const typeId = interaction.customId.replace('ceza_form_', '');
  const typeMap = {
    ceza_uyan:   { name:'Uyarı',         emoji:'⚠️', color:0xFEE75C, icon:'🟡' },
    ceza_sustur: { name:'Susturma',       emoji:'🔇', color:0xFF8C00, icon:'🟠' },
    ceza_gban:   { name:'Geçici Ban',     emoji:'⏳', color:0xFF4500, icon:'🔴' },
    ceza_ban:    { name:'Kalıcı Ban',     emoji:'⛔', color:0xFF0000, icon:'🔨' },
    ceza_rutbe:  { name:'Rütbe Düşürme', emoji:'🔱', color:0x8B0000, icon:'📉' },
  };
  const type  = typeMap[typeId];
  const hedef = interaction.fields.getTextInputValue('hedef');
  const sebep = interaction.fields.getTextInputValue('sebep');
  const kanit = interaction.fields.getTextInputValue('kanit');
  const sure  = interaction.fields.getTextInputValue('sure') || 'Süresiz';

  let category = guild.channels.cache.find((c)=>c.type===ChannelType.GuildCategory&&c.name.toLowerCase().includes('ceza'));
  if (!category) category = await guild.channels.create({ name:'⚖️ Ceza İşlemleri', type:ChannelType.GuildCategory });

  const ustRol = guild.roles.cache.get(UST_ROL_ID);
  const cezaId = `${Date.now()}`;
  const perm = [
    { id:guild.id,       deny:[PermissionFlagsBits.ViewChannel] },
    { id:client.user.id, allow:[PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
  ];
  if (ustRol) perm.push({ id:ustRol.id, allow:[PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

  const ch = await guild.channels.create({ name:`ceza-${cezaId.slice(-6)}`, type:ChannelType.GuildText, parent:category.id, permissionOverwrites:perm });
  pendingPenalties.set(cezaId, { typeId, type, hedef, sebep, kanit, sure, yetkili:interaction.member.id, channelId:ch.id });

  const embed = new EmbedBuilder()
    .setTitle(`${type.emoji} ${type.name} — Onay Bekliyor`)
    .setDescription(`📋 **Yeni Ceza Talebi**\n\n<@&${UST_ROL_ID}> lütfen inceleyin!\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    .setColor(type.color)
    .addFields(
      { name:`${type.icon} Tür`,  value:type.name,                              inline:true },
      { name:'👤 Yetkili',        value:`<@${interaction.member.id}>`,          inline:true },
      { name:'🎯 Hedef',          value:hedef,                                  inline:true },
      { name:'📋 Sebep',          value:sebep,                                  inline:false },
      { name:'📸 Kanıt',          value:kanit,                                  inline:false },
      { name:'⏱️ Süre',           value:sure,                                   inline:true },
      { name:'📅 Tarih',          value:`<t:${Math.floor(Date.now()/1000)}:F>`, inline:true },
    )
    .setFooter({ text:`Ceza ID: ${cezaId}` }).setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ceza_onayla_${cezaId}`).setLabel('✅ Onayla & Uygula').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`ceza_iptal_${cezaId}`).setLabel('❌ İptal Et').setStyle(ButtonStyle.Danger).setEmoji('❌'),
  );

  await ch.send({ content:`<@&${UST_ROL_ID}>`, embeds:[embed], components:[row] });
  await interaction.editReply({ content:`✅ Ceza talebi oluşturuldu: ${ch}\nÜst yönetim onayı bekleniyor...` });
}

async function finalizePenalty(interaction) {
  if (!interaction.member.roles.cache.has(UST_ROL_ID))
    return interaction.reply({ content:'🚫 Yetkiniz yok.', ephemeral:true });

  const cezaId  = interaction.customId.replace('ceza_onayla_','');
  const penalty = pendingPenalties.get(cezaId);
  if (!penalty) return interaction.reply({ content:'❌ Ceza kaydı bulunamadı.', ephemeral:true });

  await interaction.deferReply();

  const logEmbed = new EmbedBuilder()
    .setTitle(`${penalty.type.emoji} CEZA KAYDI — ${penalty.type.name}`)
    .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔴 **YENİ CEZA UYGULAMASI**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    .setColor(penalty.type.color)
    .addFields(
      { name:`${penalty.type.icon} Ceza`,  value:penalty.type.name,                         inline:true },
      { name:'🎯 Cezalı',                  value:penalty.hedef,                              inline:true },
      { name:'👮 Uygulayan',               value:`<@${penalty.yetkili}>`,                   inline:true },
      { name:'✅ Onaylayan',               value:`${interaction.member}`,                   inline:true },
      { name:'📋 Sebep',                   value:penalty.sebep,                              inline:false },
      { name:'📸 Kanıt',                   value:penalty.kanit,                              inline:false },
      { name:'⏱️ Süre',                    value:penalty.sure,                               inline:true },
      { name:'📅 Tarih',                   value:`<t:${Math.floor(Date.now()/1000)}:F>`,    inline:true },
    )
    .setFooter({ text:`Ceza ID: ${cezaId} | JÖH Disiplin Sistemi` }).setTimestamp();

  await sendLog(interaction.guild, logEmbed);
  pendingPenalties.delete(cezaId);

  await interaction.editReply({ embeds:[new EmbedBuilder().setTitle('✅ Ceza Onaylandı & Kaydedildi').setDescription(`Log kanalına kaydedildi.\n🗓️ **Onaylayan:** ${interaction.member}\n\n> Kanal 10 saniye içinde silinecek.`).setColor(0x57F287).setTimestamp()] });
  setTimeout(()=>interaction.channel.delete('Ceza onaylandı').catch(()=>{}), 10000);
}

async function cancelPenalty(interaction) {
  if (!interaction.member.roles.cache.has(UST_ROL_ID))
    return interaction.reply({ content:'🚫 Yetkiniz yok.', ephemeral:true });

  const cezaId = interaction.customId.replace('ceza_iptal_','');
  pendingPenalties.delete(cezaId);

  await interaction.reply({ embeds:[new EmbedBuilder().setTitle('❌ Ceza İptal Edildi').setDescription(`${interaction.member} tarafından iptal edildi.\n\nKanal 5 saniye içinde silinecek.`).setColor(0xED4245).setTimestamp()] });

  await sendLog(interaction.guild, new EmbedBuilder().setTitle('❌ Ceza Talebi İptal').setColor(0xED4245)
    .addFields({ name:'👮 İptal Eden', value:`${interaction.member}`, inline:true }, { name:'ID', value:cezaId.slice(-6), inline:true }).setTimestamp()
  );
  setTimeout(()=>interaction.channel.delete('İptal').catch(()=>{}), 5000);
}

// ── BAŞLAT ────────────────────────────────
if (!TOKEN) { console.error('❌ CEZA_TOKEN env var eksik!'); process.exit(1); }
if (!GUILD_ID) { console.error('❌ GUILD_ID env var eksik!'); process.exit(1); }

console.log('🚀 Ceza Bot başlatılıyor...');
console.log(`📋 CLIENT_ID: ${CLIENT_ID}`);
console.log(`📋 GUILD_ID: ${GUILD_ID}`);
console.log(`📋 TOKEN başı: ${TOKEN.slice(0,15)}...`);

registerCommands().then(() => {
  client.login(TOKEN).catch((err) => {
    console.error('❌ Login hatası:', err.message);
    process.exit(1);
  });
});
