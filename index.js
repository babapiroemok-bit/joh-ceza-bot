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

// ── YAPILANDIRMA ───────────────────────────
const TOKEN      = process.env.CEZA_TOKEN;
const GUILD_ID   = process.env.GUILD_ID; // Komut kaydı için, bot birden fazla sunucuda çalışabilir
const CLIENT_ID  = '1505287686208880760';

// Yetkili rol ID'leri — bu rollere sahip herkes ceza panelini kullanabilir
const YETKILI_ROL_IDS = [
  '1457350623770054758',
  '1050723395668545626',
];

// Log kanalı: env'den al, yoksa isimle ara
const LOG_CHANNEL_ID = process.env.CEZA_LOG_CHANNEL_ID || '1495454740908347464';

if (!TOKEN) { console.error('❌ CEZA_TOKEN env var eksik!'); process.exit(1); }

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

// Bellekte bekleyen cezalar
const pendingPenalties = new Map(); // key: cezaId, val: penalty objesi

// ── YETKİ KONTROLÜ ─────────────────────────
function isYetkili(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return YETKILI_ROL_IDS.some((id) => member.roles.cache.has(id));
}

// ── SLASH KOMUTLAR ─────────────────────────
// Global komutlar: GUILD_ID yoksa global kayıt (birden fazla sunucu için)
const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('⚖️ Ceza/kanıt panelini bu kanala kurar')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('log-kur')
    .setDescription('📋 Bu kanalı ceza log kanalı olarak ayarlar')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('ceza-listesi')
    .setDescription('📋 Onay bekleyen ceza taleplerini listeler')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('kanit-ekle')
    .setDescription('📸 Mevcut bir ceza talebine yeni kanıt ekler')
    .addStringOption((o) => o.setName('ceza_id').setDescription('Ceza ID\'si (son 6 hane)').setRequired(true))
    .addStringOption((o) => o.setName('kanit').setDescription('Eklenecek kanıt (link veya açıklama)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('durum')
    .setDescription('📊 Botun durumunu gösterir'),

  new SlashCommandBuilder()
    .setName('yardim')
    .setDescription('📖 Tüm komutları listeler'),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    if (GUILD_ID) {
      // Guild bazlı kayıt (anlık)
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log('✅ Guild komutları kaydedildi.');
    } else {
      // Global kayıt (1 saate kadar sürer ama tüm sunucularda çalışır)
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('✅ Global komutlar kaydedildi.');
    }
  } catch (e) {
    console.error('❌ Komut kaydı hatası:', e.message);
  }
}

// ── YARDIMCI FONKSİYONLAR ─────────────────
async function sendLog(guild, embed) {
  try {
    // Önce sabit ID dene
    const fixed = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (fixed) { await fixed.send({ embeds: [embed] }); return; }
    // Sonra isimle ara
    const byName = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name.toLowerCase().includes('ceza-log')
    );
    if (byName) await byName.send({ embeds: [embed] });
  } catch {}
}

function uptimeStr() {
  const u = process.uptime();
  return `${Math.floor(u / 3600)}sa ${Math.floor((u % 3600) / 60)}dk ${Math.floor(u % 60)}sn`;
}

// ── READY ──────────────────────────────────
client.once('ready', () => {
  console.log(`✅ Ceza Bot aktif: ${client.user.tag}`);
  console.log(`✅ ${client.guilds.cache.size} sunucuda aktif`);
  console.log(`✅ Yetkili roller: ${YETKILI_ROL_IDS.join(', ')}`);
  setupWatchdog(client, TOKEN, GUILD_ID);
});

// ── INTERACTION HANDLER ────────────────────
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) await handleCommand(interaction);
    else if (interaction.isButton())       await handleButton(interaction);
    else if (interaction.isModalSubmit())  await handleModal(interaction);
  } catch (err) {
    console.error('[HATA]', err);
    const msg = { content: '❌ Bir hata oluştu. Lütfen tekrar deneyin.', ephemeral: true };
    if (interaction.deferred) await interaction.editReply(msg).catch(() => {});
    else if (!interaction.replied) await interaction.reply(msg).catch(() => {});
  }
});

// ── KOMUT İŞLEYİCİ ────────────────────────
async function handleCommand(interaction) {
  const { commandName, guild, member, channel } = interaction;

  // ── /durum ──
  if (commandName === 'durum') {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('📊 Ceza Bot — Durum').setColor(0x57F287)
        .addFields(
          { name: '🏓 Ping',             value: `${client.ws.ping}ms`,           inline: true },
          { name: '⏱️ Uptime',           value: uptimeStr(),                      inline: true },
          { name: '⚖️ Bekleyen Cezalar', value: `${pendingPenalties.size}`,      inline: true },
          { name: '🤖 Bot',              value: client.user.tag,                  inline: true },
          { name: '📡 Sunucu',           value: `${client.guilds.cache.size}`,   inline: true },
          { name: '💚 Durum',             value: '🟢 Online',                     inline: true },
        )
        .setFooter({ text: 'JÖH Disiplin v2.0 | Watchdog 🛡️' }).setTimestamp()],
      ephemeral: true,
    });
  }

  // ── /yardim ──
  if (commandName === 'yardim') {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('⚖️ JÖH Ceza/Kanıt Bot — Komut Listesi').setColor(0xFF4444)
        .setDescription('Yetkili rollere sahip herkes ceza panelini kullanabilir.')
        .addFields(
          { name: '⚙️ Yetkili Komutları', value: '\u200b' },
          { name: '/panel',        value: 'Ceza panelini kurar',                  inline: true },
          { name: '/log-kur',      value: 'Log kanalı ayarlar',                  inline: true },
          { name: '/ceza-listesi', value: 'Bekleyen cezaları listeler',           inline: true },
          { name: '/kanit-ekle',   value: 'Cezaya ek kanıt ekler',               inline: true },
          { name: '📖 Genel',      value: '\u200b' },
          { name: '/durum',        value: 'Bot durumunu gösterir',               inline: true },
          { name: '/yardim',       value: 'Bu menü',                             inline: true },
          { name: '🖱️ Panel Butonları',   value: '\u200b' },
          { name: '🟡 Uyarı',       value: 'Uyarı cezası',                       inline: true },
          { name: '🟠 Sustur',      value: 'Susturma cezası',                    inline: true },
          { name: '🔴 Geçici Ban',  value: 'Geçici ban',                         inline: true },
          { name: '⛔ Kalıcı Ban',  value: 'Kalıcı ban',                         inline: true },
          { name: '🔱 Rütbe Düşür', value: 'Rütbe düşürme',                     inline: true },
          { name: '📋 Ceza Süreci', value: '1️⃣ Butona bas → 2️⃣ Formu doldur (sebep+kanıt) → 3️⃣ Kanal açılır → 4️⃣ Onayla', inline: false },
        )
        .setFooter({ text: 'JÖH Disiplin Sistemi v2.0' }).setTimestamp()],
      ephemeral: true,
    });
  }

  // ── /panel ──
  if (commandName === 'panel') {
    const embed = new EmbedBuilder()
      .setTitle('⚖️ JÖH Ceza / Kanıt Paneli')
      .setDescription(
        '**Jandarma Özel Harekat Disiplin Sistemi**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
        '🚔 **Ceza Türleri:**\n' +
        '> 🟡 **Uyarı** — Hafif ihlaller\n' +
        '> 🟠 **Susturma** — Konuşma ihlalleri\n' +
        '> 🔴 **Geçici Ban** — Ciddi ihlaller\n' +
        '> ⛔ **Kalıcı Ban** — Çok ciddi ihlaller\n' +
        '> 🔱 **Rütbe Düşürme** — Görev ihlali\n\n' +
        '⚠️ *Her ceza **sebep + kanıt** ile kayıt altına alınır.*\n' +
        '📋 *Ceza talebi oluşturulur, ikinci yetkili onaylar.*\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
      )
      .setColor(0xFF4444)
      .setFooter({ text: 'JÖH Disiplin Sistemi v2.0' })
      .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ceza_uyan').setLabel('⚠️ Uyarı').setStyle(ButtonStyle.Secondary).setEmoji('🟡'),
      new ButtonBuilder().setCustomId('ceza_sustur').setLabel('🔇 Sustur').setStyle(ButtonStyle.Primary).setEmoji('🟠'),
      new ButtonBuilder().setCustomId('ceza_gban').setLabel('⏳ Geçici Ban').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ceza_ban').setLabel('⛔ Kalıcı Ban').setStyle(ButtonStyle.Danger).setEmoji('🔨'),
      new ButtonBuilder().setCustomId('ceza_rutbe').setLabel('🔱 Rütbe Düşür').setStyle(ButtonStyle.Secondary).setEmoji('📉'),
    );

    await channel.send({ embeds: [embed], components: [row1, row2] });
    return interaction.reply({ content: '✅ Ceza paneli kuruldu!', ephemeral: true });
  }

  // ── /log-kur ──
  if (commandName === 'log-kur') {
    try { await channel.setName('ceza-logs'); } catch {}
    return interaction.reply({ content: `✅ ${channel} artık **ceza log** kanalı olarak kullanılacak!`, ephemeral: true });
  }

  // ── /ceza-listesi ──
  if (commandName === 'ceza-listesi') {
    if (pendingPenalties.size === 0) {
      return interaction.reply({ content: '✅ Şu an onay bekleyen ceza talebi yok.', ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setTitle(`📋 Onay Bekleyen Ceza Talepleri (${pendingPenalties.size})`)
      .setColor(0xFF8C00).setTimestamp();
    for (const [id, p] of pendingPenalties.entries()) {
      embed.addFields({
        name: `${p.type.emoji} ${p.type.name} — ID: \`${id.slice(-6)}\``,
        value: `🎯 **Hedef:** ${p.hedef}\n👮 **Yetkili:** <@${p.yetkili}>\n📅 <t:${Math.floor(p.tarih / 1000)}:R>`,
        inline: false,
      });
    }
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── /kanit-ekle ──
  if (commandName === 'kanit-ekle') {
    if (!isYetkili(member)) {
      return interaction.reply({ content: '🚫 Bu komut için yetkiniz yok.', ephemeral: true });
    }
    const cezaId = interaction.options.getString('ceza_id');
    const kanit  = interaction.options.getString('kanit');

    // ID'nin son 6 hanesi ile eşleştir
    let found = null;
    for (const [id, p] of pendingPenalties.entries()) {
      if (id.slice(-6) === cezaId) { found = { id, p }; break; }
    }

    if (!found) return interaction.reply({ content: `❌ \`${cezaId}\` ID'li ceza talebi bulunamadı.`, ephemeral: true });

    found.p.kanit += `\n\n**[Ek Kanıt — ${new Date().toLocaleString('tr-TR')}]**\n${kanit}`;

    // Ceza kanalındaki mesajı güncelle (mümkünse)
    const cezaCh = guild.channels.cache.get(found.p.channelId);
    if (cezaCh) {
      await cezaCh.send({
        embeds: [new EmbedBuilder()
          .setTitle('📸 Yeni Kanıt Eklendi')
          .setDescription(kanit)
          .setColor(0xFEE75C)
          .addFields({ name: '👮 Ekleyen', value: `${member}`, inline: true })
          .setTimestamp()],
      }).catch(() => {});
    }

    return interaction.reply({ content: `✅ \`${cezaId}\` nolu cezaya yeni kanıt eklendi.`, ephemeral: true });
  }
}

// ── BUTON İŞLEYİCİ ────────────────────────
async function handleButton(interaction) {
  const id          = interaction.customId;
  const cezaTurleri = ['ceza_uyan', 'ceza_sustur', 'ceza_gban', 'ceza_ban', 'ceza_rutbe'];

  if (cezaTurleri.includes(id)) {
    if (!isYetkili(interaction.member)) {
      return interaction.reply({ content: '🚫 Bu paneli kullanmak için yetkili rolüne sahip olmanız gerekiyor.', ephemeral: true });
    }
    await showPenaltyModal(interaction, id);
  } else if (id.startsWith('ceza_onayla_')) {
    await finalizePenalty(interaction);
  } else if (id.startsWith('ceza_iptal_')) {
    await cancelPenalty(interaction);
  }
}

// ── MODAL İŞLEYİCİ ────────────────────────
async function handleModal(interaction) {
  if (interaction.customId.startsWith('ceza_form_')) {
    await handlePenaltyForm(interaction);
  }
}

// ── CEZA MODAL GÖSTER ──────────────────────
async function showPenaltyModal(interaction, typeId) {
  const typeNames = {
    ceza_uyan:   'Uyarı',
    ceza_sustur: 'Susturma',
    ceza_gban:   'Geçici Ban',
    ceza_ban:    'Kalıcı Ban',
    ceza_rutbe:  'Rütbe Düşürme',
  };

  const modal = new ModalBuilder()
    .setCustomId(`ceza_form_${typeId}`)
    .setTitle(`⚖️ ${typeNames[typeId]} — Kanıt Formu`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('hedef').setLabel('👤 Hedef Kişi (ID veya kullanıcı adı)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('sebep').setLabel('📋 Ceza Sebebi (detaylı açıklayın)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('kanit').setLabel('📸 Kanıt (screenshot linki, video linki vb.)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('sure').setLabel('⏱️ Süre (geçici cezalar için)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(50).setPlaceholder('Örn: 7 gün, 24 saat, Süresiz')
    ),
  );

  await interaction.showModal(modal);
}

// ── CEZA FORM GÖNDER ───────────────────────
async function handlePenaltyForm(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const { guild, member } = interaction;
  const typeId = interaction.customId.replace('ceza_form_', '');
  const typeMap = {
    ceza_uyan:   { name: 'Uyarı',         emoji: '⚠️', icon: '🟡', color: 0xFEE75C },
    ceza_sustur: { name: 'Susturma',       emoji: '🔇', icon: '🟠', color: 0xFF8C00 },
    ceza_gban:   { name: 'Geçici Ban',     emoji: '⏳', icon: '🔴', color: 0xFF4500 },
    ceza_ban:    { name: 'Kalıcı Ban',     emoji: '⛔', icon: '🔨', color: 0xFF0000 },
    ceza_rutbe:  { name: 'Rütbe Düşürme', emoji: '🔱', icon: '📉', color: 0x8B0000 },
  };
  const type  = typeMap[typeId];
  const hedef = interaction.fields.getTextInputValue('hedef');
  const sebep = interaction.fields.getTextInputValue('sebep');
  const kanit = interaction.fields.getTextInputValue('kanit');
  const sure  = interaction.fields.getTextInputValue('sure') || 'Süresiz';
  const cezaId = `${Date.now()}`;

  // Kategori bul/oluştur
  let cat = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('ceza'));
  if (!cat) cat = await guild.channels.create({ name: '⚖️ Ceza İşlemleri', type: ChannelType.GuildCategory });

  // Kanal izinleri: yetkili rollere ve bota ver
  const perms = [
    { id: guild.id,       deny:  [PermissionFlagsBits.ViewChannel] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks] },
  ];
  for (const rolId of YETKILI_ROL_IDS) {
    const rol = guild.roles.cache.get(rolId);
    if (rol) perms.push({ id: rol.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }
  // Cezayı açan kişiye de ver
  perms.push({ id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] });

  const ch = await guild.channels.create({
    name: `ceza-${cezaId.slice(-6)}`,
    type: ChannelType.GuildText,
    parent: cat.id,
    permissionOverwrites: perms,
  });

  pendingPenalties.set(cezaId, {
    typeId, type, hedef, sebep, kanit, sure,
    yetkili: member.id, channelId: ch.id, tarih: Date.now(),
  });

  // Yetkili rolleri mention et
  const mentions = YETKILI_ROL_IDS.map((id) => `<@&${id}>`).join(' ');

  const embed = new EmbedBuilder()
    .setTitle(`${type.emoji} ${type.name} Cezası — Onay Bekliyor`)
    .setDescription(`📋 **Yeni Ceza Talebi**\n\n${mentions} lütfen inceleyin!\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    .setColor(type.color)
    .addFields(
      { name: `${type.icon} Ceza Türü`,   value: type.name,                              inline: true },
      { name: '👮 Talep Eden',             value: `${member}`,                            inline: true },
      { name: '🎯 Hedef',                  value: hedef,                                  inline: true },
      { name: '📋 Sebep',                  value: sebep,                                  inline: false },
      { name: '📸 Kanıt',                  value: kanit,                                  inline: false },
      { name: '⏱️ Süre',                   value: sure,                                   inline: true },
      { name: '📅 Tarih',                  value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      { name: '🔑 Ceza ID',                value: `\`${cezaId.slice(-6)}\``,             inline: true },
    )
    .setFooter({ text: `ID: ${cezaId} | JÖH Disiplin Sistemi` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ceza_onayla_${cezaId}`).setLabel('✅ Onayla & Uygula').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`ceza_iptal_${cezaId}`).setLabel('❌ İptal Et').setStyle(ButtonStyle.Danger).setEmoji('❌'),
  );

  await ch.send({ content: mentions, embeds: [embed], components: [row] });
  await interaction.editReply({ content: `✅ Ceza talebi oluşturuldu: ${ch}\nDiğer bir yetkili onaylaması bekleniyor...` });
}

// ── CEZA ONAYLA ────────────────────────────
async function finalizePenalty(interaction) {
  if (!isYetkili(interaction.member)) {
    return interaction.reply({ content: '🚫 Bu işlem için yetkiniz yok.', ephemeral: true });
  }

  const cezaId  = interaction.customId.replace('ceza_onayla_', '');
  const penalty = pendingPenalties.get(cezaId);
  if (!penalty) return interaction.reply({ content: '❌ Ceza talebi bulunamadı (zaten işlendi veya iptal edildi).', ephemeral: true });

  // Kendi talebini onaylayamasın
  if (penalty.yetkili === interaction.member.id) {
    return interaction.reply({ content: '⚠️ Kendi ceza talebinizi onaylayamazsınız. Başka bir yetkili onaylamalı.', ephemeral: true });
  }

  await interaction.deferReply();

  const logEmbed = new EmbedBuilder()
    .setTitle(`${penalty.type.emoji} CEZA KAYDI — ${penalty.type.name.toUpperCase()}`)
    .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔴 **ONAYLANAN CEZA**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    .setColor(penalty.type.color)
    .addFields(
      { name: `${penalty.type.icon} Ceza`,  value: penalty.type.name,                                  inline: true },
      { name: '🎯 Cezalı',                  value: penalty.hedef,                                       inline: true },
      { name: '⏱️ Süre',                    value: penalty.sure,                                        inline: true },
      { name: '👮 Talep Eden',              value: `<@${penalty.yetkili}>`,                            inline: true },
      { name: '✅ Onaylayan',               value: `${interaction.member}`,                            inline: true },
      { name: '📅 Tarih',                   value: `<t:${Math.floor(Date.now() / 1000)}:F>`,           inline: true },
      { name: '📋 Sebep',                   value: penalty.sebep,                                       inline: false },
      { name: '📸 Kanıt',                   value: penalty.kanit,                                       inline: false },
    )
    .setFooter({ text: `Ceza ID: ${cezaId.slice(-6)} | JÖH Disiplin Sistemi` })
    .setTimestamp();

  await sendLog(interaction.guild, logEmbed);
  pendingPenalties.delete(cezaId);

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setTitle('✅ Ceza Onaylandı ve Kaydedildi')
      .setDescription(`Log kanalına kaydedildi.\n👮 **Onaylayan:** ${interaction.member}\n\n> Kanal 10 saniye içinde silinecek.`)
      .setColor(0x57F287).setTimestamp()],
  });

  setTimeout(() => interaction.channel.delete('Ceza onaylandı').catch(() => {}), 10000);
}

// ── CEZA İPTAL ─────────────────────────────
async function cancelPenalty(interaction) {
  if (!isYetkili(interaction.member)) {
    return interaction.reply({ content: '🚫 Bu işlem için yetkiniz yok.', ephemeral: true });
  }

  const cezaId = interaction.customId.replace('ceza_iptal_', '');
  const penalty = pendingPenalties.get(cezaId);
  if (!penalty) return interaction.reply({ content: '❌ Ceza talebi bulunamadı.', ephemeral: true });

  pendingPenalties.delete(cezaId);

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setTitle('❌ Ceza Talebi İptal Edildi')
      .setDescription(`${interaction.member} tarafından iptal edildi.\n\n> Kanal 5 saniye içinde silinecek.`)
      .setColor(0xED4245).setTimestamp()],
  });

  await sendLog(interaction.guild, new EmbedBuilder()
    .setTitle('❌ Ceza Talebi İptal').setColor(0xED4245)
    .addFields(
      { name: '👮 İptal Eden', value: `${interaction.member}`, inline: true },
      { name: '🔑 ID',         value: cezaId.slice(-6),         inline: true },
      { name: '🎯 Hedef',      value: penalty.hedef,            inline: true },
    ).setTimestamp()
  );

  setTimeout(() => interaction.channel.delete('İptal edildi').catch(() => {}), 5000);
}

// ── BAŞLAT ─────────────────────────────────
console.log('🚀 Ceza Bot başlatılıyor...');
console.log(`📋 CLIENT_ID        : ${CLIENT_ID}`);
console.log(`📋 GUILD_ID         : ${GUILD_ID || 'YOK (global komutlar)'}`);
console.log(`📋 TOKEN            : ${TOKEN.slice(0, 20)}...`);
console.log(`📋 YETKILI_ROLLER   : ${YETKILI_ROL_IDS.join(', ')}`);
console.log(`📋 LOG_CHANNEL_ID   : ${LOG_CHANNEL_ID}`);

registerCommands().then(() => {
  client.login(TOKEN).catch((err) => {
    console.error('❌ Login hatası:', err.message);
    process.exit(1);
  });
});
