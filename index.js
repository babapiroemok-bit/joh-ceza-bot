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

const TOKEN           = process.env.CEZA_TOKEN;
const UST_ROL_ID      = '1505270476652413079';
const CEZA_LOG_CH_ID  = '1495454740908347464';

const pendingPenalties = new Map();

// ──────────────────────────────────────────
//  LOG HELPER — ceza kanalına + ayrı log kanalına
// ──────────────────────────────────────────
async function sendLog(guild, embed) {
  // Sabit ceza log kanalı
  const fixed = guild.channels.cache.get(CEZA_LOG_CH_ID);
  if (fixed) await fixed.send({ embeds: [embed] }).catch(() => {});

  // Ayrıca adında "ceza-log" geçen kanal varsa oraya da gönder
  const extra = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText &&
      c.name.toLowerCase().includes('ceza-log') &&
      c.id !== CEZA_LOG_CH_ID
  );
  if (extra) await extra.send({ embeds: [embed] }).catch(() => {});
}

client.once('ready', () => {
  console.log(`✅ Ceza Kanıt Bot aktif: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  if (message.content === '!ceza-panel') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply('❌ Yönetici yetkisi gereklidir.');

    const embed = new EmbedBuilder()
      .setTitle('⚖️ JÖH Ceza Yönetim Paneli')
      .setDescription(
        '**Jandarma Özel Harekat Disiplin Sistemi**\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
        '🚔 **Ceza İşlemleri:**\n' +
        '> 🟡 **Uyarı** — Hafif ihlaller\n' +
        '> 🟠 **Susturma** — Konuşma ihlalleri\n' +
        '> 🔴 **Geçici Ban** — Ciddi ihlaller\n' +
        '> ⛔ **Kalıcı Ban** — Çok ciddi ihlaller\n' +
        '> 🔱 **Rütbe Düşürme** — Görev ihlali\n\n' +
        '⚠️ *Tüm cezalar kanıt ile birlikte kayıt altına alınır.*\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
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

    await message.channel.send({ embeds: [embed], components: [row1, row2] });
    await message.delete().catch(() => {});
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    const id = interaction.customId;
    const cezaTurleri = ['ceza_uyan','ceza_sustur','ceza_gban','ceza_ban','ceza_rutbe'];

    if (cezaTurleri.includes(id)) {
      if (!interaction.member.roles.cache.has(UST_ROL_ID))
        return interaction.reply({ content: '🚫 **Yetersiz Yetki!**\n\nBu paneli sadece **Üst Yönetim** kullanabilir.', ephemeral: true });
      await showPenaltyModal(interaction, id);
    } else if (id.startsWith('ceza_onayla_')) {
      await finalizePenalty(interaction);
    } else if (id.startsWith('ceza_iptal_')) {
      await cancelPenalty(interaction);
    }
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('ceza_form_')) {
    await handlePenaltyForm(interaction);
  }
});

async function showPenaltyModal(interaction, typeId) {
  const typeNames = { ceza_uyan: 'Uyarı', ceza_sustur: 'Susturma', ceza_gban: 'Geçici Ban', ceza_ban: 'Kalıcı Ban', ceza_rutbe: 'Rütbe Düşürme' };
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
    ceza_uyan:   { name: 'Uyarı',          emoji: '⚠️', color: 0xFEE75C, icon: '🟡' },
    ceza_sustur: { name: 'Susturma',        emoji: '🔇', color: 0xFF8C00, icon: '🟠' },
    ceza_gban:   { name: 'Geçici Ban',      emoji: '⏳', color: 0xFF4500, icon: '🔴' },
    ceza_ban:    { name: 'Kalıcı Ban',      emoji: '⛔', color: 0xFF0000, icon: '🔨' },
    ceza_rutbe:  { name: 'Rütbe Düşürme',  emoji: '🔱', color: 0x8B0000, icon: '📉' },
  };
  const type   = typeMap[typeId];
  const hedef  = interaction.fields.getTextInputValue('hedef');
  const sebep  = interaction.fields.getTextInputValue('sebep');
  const kanit  = interaction.fields.getTextInputValue('kanit');
  const sure   = interaction.fields.getTextInputValue('sure') || 'Süresiz';

  let category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('ceza'));
  if (!category) category = await guild.channels.create({ name: '⚖️ Ceza İşlemleri', type: ChannelType.GuildCategory });

  const ustRol = guild.roles.cache.get(UST_ROL_ID);
  const cezaId = `${Date.now()}`;

  const permOverwrites = [
    { id: guild.id,       deny: [PermissionFlagsBits.ViewChannel] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
  ];
  if (ustRol) permOverwrites.push({ id: ustRol.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

  const cezaKanal = await guild.channels.create({
    name: `ceza-${cezaId.slice(-6)}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites,
  });

  pendingPenalties.set(cezaId, { typeId, type, hedef, sebep, kanit, sure, yetkili: interaction.member.id, channelId: cezaKanal.id });

  const embed = new EmbedBuilder()
    .setTitle(`${type.emoji} ${type.name} — Onay Bekliyor`)
    .setDescription(`📋 **Yeni Ceza Talebi**\n\n<@&${UST_ROL_ID}> lütfen inceleyin!\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    .setColor(type.color)
    .addFields(
      { name: `${type.icon} Tür`,       value: type.name,                                inline: true },
      { name: '👤 Yetkili',             value: `<@${interaction.member.id}>`,            inline: true },
      { name: '🎯 Hedef',               value: hedef,                                    inline: true },
      { name: '📋 Sebep',               value: sebep,                                    inline: false },
      { name: '📸 Kanıt',               value: kanit,                                    inline: false },
      { name: '⏱️ Süre',                value: sure,                                     inline: true },
      { name: '📅 Tarih',               value: `<t:${Math.floor(Date.now()/1000)}:F>`,  inline: true },
    )
    .setFooter({ text: `Ceza ID: ${cezaId}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ceza_onayla_${cezaId}`).setLabel('✅ Onayla & Uygula').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`ceza_iptal_${cezaId}`).setLabel('❌ İptal Et').setStyle(ButtonStyle.Danger).setEmoji('❌'),
  );

  await cezaKanal.send({ content: `<@&${UST_ROL_ID}>`, embeds: [embed], components: [row] });
  await interaction.editReply({ content: `✅ Ceza talebi oluşturuldu: ${cezaKanal}\nÜst yönetim onayı bekleniyor...` });
}

async function finalizePenalty(interaction) {
  if (!interaction.member.roles.cache.has(UST_ROL_ID))
    return interaction.reply({ content: '🚫 Yetkiniz yok.', ephemeral: true });

  const cezaId = interaction.customId.replace('ceza_onayla_', '');
  const penalty = pendingPenalties.get(cezaId);
  if (!penalty) return interaction.reply({ content: '❌ Bu ceza kaydı bulunamadı.', ephemeral: true });

  await interaction.deferReply();
  const guild = interaction.guild;

  const logEmbed = new EmbedBuilder()
    .setTitle(`${penalty.type.emoji} CEZA KAYDI — ${penalty.type.name}`)
    .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔴 **YENİ CEZA UYGULAMASI**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    .setColor(penalty.type.color)
    .addFields(
      { name: `${penalty.type.icon} Ceza Türü`, value: penalty.type.name,                          inline: true },
      { name: '🎯 Cezalı Kişi',                 value: penalty.hedef,                              inline: true },
      { name: '👮 Uygulayan',                   value: `<@${penalty.yetkili}>`,                    inline: true },
      { name: '✅ Onaylayan',                   value: `${interaction.member}`,                    inline: true },
      { name: '📋 Sebep',                       value: penalty.sebep,                              inline: false },
      { name: '📸 Kanıt',                       value: penalty.kanit,                              inline: false },
      { name: '⏱️ Süre',                        value: penalty.sure,                               inline: true },
      { name: '📅 Tarih',                       value: `<t:${Math.floor(Date.now()/1000)}:F>`,     inline: true },
    )
    .setFooter({ text: `Ceza ID: ${cezaId} | JÖH Disiplin Sistemi` })
    .setTimestamp();

  // Log'u hem sabit kanala hem de log kanalına gönder
  await sendLog(guild, logEmbed);

  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Ceza Onaylandı & Kaydedildi')
    .setDescription(`Ceza log kanalına kaydedildi.\n🗓️ **Onaylayan:** ${interaction.member}\n\n> Kanal 10 saniye içinde silinecek.`)
    .setColor(0x57F287).setTimestamp();

  await interaction.editReply({ embeds: [confirmEmbed] });
  pendingPenalties.delete(cezaId);
  setTimeout(() => interaction.channel.delete('Ceza onaylandı').catch(() => {}), 10000);
}

async function cancelPenalty(interaction) {
  if (!interaction.member.roles.cache.has(UST_ROL_ID))
    return interaction.reply({ content: '🚫 Yetkiniz yok.', ephemeral: true });

  const cezaId = interaction.customId.replace('ceza_iptal_', '');
  pendingPenalties.delete(cezaId);

  const embed = new EmbedBuilder()
    .setTitle('❌ Ceza İptal Edildi')
    .setDescription(`${interaction.member} ceza işlemini iptal etti.\n\nKanal 5 saniye içinde silinecek.`)
    .setColor(0xED4245).setTimestamp();

  await interaction.reply({ embeds: [embed] });

  await sendLog(interaction.guild, new EmbedBuilder()
    .setTitle('❌ Ceza Talebi İptal Edildi')
    .setColor(0xED4245)
    .addFields(
      { name: '👮 İptal Eden', value: `${interaction.member}`, inline: true },
      { name: 'Ceza ID',       value: cezaId,                  inline: true },
    ).setTimestamp()
  );

  setTimeout(() => interaction.channel.delete('İptal edildi').catch(() => {}), 5000);
}

client.login(TOKEN);
