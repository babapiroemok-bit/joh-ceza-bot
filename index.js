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

const TOKEN = process.env.CEZA_TOKEN;
const UST_YONETIM_ROLE_ID = '1505270476652413079';
const CEZA_LOG_CHANNEL_ID = '1495454740908347464';

const pendingPenalties = new Map();

client.once('ready', () => {
  console.log(`✅ Ceza Kanıt Bot aktif: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  if (message.content === '!ceza-panel') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Bu komutu kullanmak için yönetici yetkisi gereklidir.');
    }

    const embed = new EmbedBuilder()
      .setTitle('⚖️ JÖH Ceza Yönetim Paneli')
      .setDescription(
        '**Jandarma Özel Harekat Disiplin Sistemi**\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
        '🚔 **Ceza İşlemleri:**\n' +
        '> 🟡 **Uyarı** — Hafif ihlaller için\n' +
        '> 🟠 **Susturma** — Konuşma ihlalleri için\n' +
        '> 🔴 **Geçici Ban** — Ciddi ihlaller için\n' +
        '> ⛔ **Kalıcı Ban** — Çok ciddi ihlaller için\n' +
        '> 🔱 **Rütbe Düşürme** — Görev ihlali için\n\n' +
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

    const cezaTurleri = ['ceza_uyan', 'ceza_sustur', 'ceza_gban', 'ceza_ban', 'ceza_rutbe'];

    if (cezaTurleri.includes(id)) {
      if (!interaction.member.roles.cache.has(UST_YONETIM_ROLE_ID)) {
        return interaction.reply({
          content: '🚫 **Yetersiz Yetki!**\n\nBu paneli sadece **Üst Yönetim** kullanabilir.',
          ephemeral: true,
        });
      }
      await showPenaltyModal(interaction, id);
    } else if (id.startsWith('cezakanal_olustur_')) {
      await createPenaltyChannel(interaction);
    } else if (id.startsWith('ceza_onayla_')) {
      await finalizePenalty(interaction);
    } else if (id.startsWith('ceza_iptal_')) {
      await cancelPenalty(interaction);
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('ceza_form_')) {
      await handlePenaltyForm(interaction);
    }
  }
});

async function showPenaltyModal(interaction, typeId) {
  const typeMap = {
    ceza_uyan: 'Uyarı',
    ceza_sustur: 'Susturma',
    ceza_gban: 'Geçici Ban',
    ceza_ban: 'Kalıcı Ban',
    ceza_rutbe: 'Rütbe Düşürme',
  };

  const typeName = typeMap[typeId];

  const modal = new ModalBuilder()
    .setCustomId(`ceza_form_${typeId}`)
    .setTitle(`⚖️ ${typeName} İşlemi`);

  const hedef = new TextInputBuilder()
    .setCustomId('hedef')
    .setLabel('👤 Ceza Verilecek Kişi (ID veya @kullanıcı)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Kullanıcı ID\'si veya kullanıcı adı')
    .setRequired(true)
    .setMaxLength(100);

  const sebep = new TextInputBuilder()
    .setCustomId('sebep')
    .setLabel('📋 Ceza Sebebi')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Ceza sebebini detaylı olarak açıklayın...')
    .setRequired(true)
    .setMaxLength(500);

  const kanit = new TextInputBuilder()
    .setCustomId('kanit')
    .setLabel('📸 Kanıt (Ekran görüntüsü linki / Açıklama)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Kanıt linklerini veya açıklamasını girin...')
    .setRequired(true)
    .setMaxLength(1000);

  const sure = new TextInputBuilder()
    .setCustomId('sure')
    .setLabel('⏱️ Süre (Geçici ban/susturma için, diğerleri boş bırakın)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Örnek: 7 gün, 24 saat, 30 dakika')
    .setRequired(false)
    .setMaxLength(50);

  modal.addComponents(
    new ActionRowBuilder().addComponents(hedef),
    new ActionRowBuilder().addComponents(sebep),
    new ActionRowBuilder().addComponents(kanit),
    new ActionRowBuilder().addComponents(sure),
  );

  await interaction.showModal(modal);
}

async function handlePenaltyForm(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  const typeId = interaction.customId.replace('ceza_form_', '');

  const typeMap = {
    ceza_uyan: { name: 'Uyarı', emoji: '⚠️', color: 0xFEE75C, icon: '🟡' },
    ceza_sustur: { name: 'Susturma', emoji: '🔇', color: 0xFF8C00, icon: '🟠' },
    ceza_gban: { name: 'Geçici Ban', emoji: '⏳', color: 0xFF4500, icon: '🔴' },
    ceza_ban: { name: 'Kalıcı Ban', emoji: '⛔', color: 0xFF0000, icon: '🔨' },
    ceza_rutbe: { name: 'Rütbe Düşürme', emoji: '🔱', color: 0x8B0000, icon: '📉' },
  };

  const type = typeMap[typeId];
  const hedef = interaction.fields.getTextInputValue('hedef');
  const sebep = interaction.fields.getTextInputValue('sebep');
  const kanit = interaction.fields.getTextInputValue('kanit');
  const sure = interaction.fields.getTextInputValue('sure') || 'Süresiz';

  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('ceza')
  );

  if (!category) {
    category = await guild.channels.create({
      name: '⚖️ Ceza İşlemleri',
      type: ChannelType.GuildCategory,
    });
  }

  const ustYonetimRole = guild.roles.cache.get(UST_YONETIM_ROLE_ID);
  const cezaId = `${Date.now()}`;
  const channelName = `${type.emoji.replace(/[^a-zA-Z0-9]/g, '')}-ceza-${cezaId.slice(-6)}`;

  const permOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: client.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
    },
  ];

  if (ustYonetimRole) {
    permOverwrites.push({
      id: ustYonetimRole.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  const cezaKanal = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: permOverwrites,
  });

  pendingPenalties.set(cezaId, {
    typeId,
    type,
    hedef,
    sebep,
    kanit,
    sure,
    yetkili: interaction.member.id,
    channelId: cezaKanal.id,
    timestamp: Date.now(),
  });

  const embed = new EmbedBuilder()
    .setTitle(`${type.emoji} ${type.name} İşlemi - Onay Bekliyor`)
    .setDescription(
      `📋 **Yeni Ceza Talebi**\n\n` +
      `<@&${UST_YONETIM_ROLE_ID}> lütfen bu ceza işlemini inceleyin!\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setColor(type.color)
    .addFields(
      { name: `${type.icon} Ceza Türü`, value: type.name, inline: true },
      { name: '👤 Yetkili', value: `<@${interaction.member.id}>`, inline: true },
      { name: '🎯 Hedef Kişi', value: hedef, inline: true },
      { name: '📋 Ceza Sebebi', value: sebep, inline: false },
      { name: '📸 Kanıt', value: kanit, inline: false },
      { name: '⏱️ Süre', value: sure, inline: true },
      { name: '📅 Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
    )
    .setFooter({ text: `Ceza ID: ${cezaId}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ceza_onayla_${cezaId}`)
      .setLabel('✅ Cezayı Onayla & Uygula')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`ceza_iptal_${cezaId}`)
      .setLabel('❌ İptal Et')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌'),
  );

  await cezaKanal.send({
    content: `<@&${UST_YONETIM_ROLE_ID}>`,
    embeds: [embed],
    components: [row],
  });

  await interaction.editReply({
    content: `✅ Ceza talebi oluşturuldu: ${cezaKanal}\nÜst yönetim onayı bekleniyor...`,
  });
}

async function finalizePenalty(interaction) {
  if (!interaction.member.roles.cache.has(UST_YONETIM_ROLE_ID)) {
    return interaction.reply({ content: '🚫 Yetkiniz yok.', ephemeral: true });
  }

  const cezaId = interaction.customId.replace('ceza_onayla_', '');
  const penalty = pendingPenalties.get(cezaId);

  if (!penalty) {
    return interaction.reply({ content: '❌ Bu ceza kaydı bulunamadı veya zaten işleme alındı.', ephemeral: true });
  }

  await interaction.deferReply();

  const guild = interaction.guild;
  const logChannel = guild.channels.cache.get(CEZA_LOG_CHANNEL_ID);

  const logEmbed = new EmbedBuilder()
    .setTitle(`${penalty.type.emoji} CEZA KAYDI — ${penalty.type.name}`)
    .setDescription(
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔴 **YENİ CEZA UYGULAMASI**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setColor(penalty.type.color)
    .addFields(
      { name: `${penalty.type.icon} Ceza Türü`, value: penalty.type.name, inline: true },
      { name: '🎯 Cezalı Kişi', value: penalty.hedef, inline: true },
      { name: '👮 Uygulayan Yetkili', value: `<@${penalty.yetkili}>`, inline: true },
      { name: '✅ Onaylayan', value: `${interaction.member}`, inline: true },
      { name: '📋 Sebep', value: penalty.sebep, inline: false },
      { name: '📸 Kanıt', value: penalty.kanit, inline: false },
      { name: '⏱️ Süre', value: penalty.sure, inline: true },
      { name: '📅 İşlem Tarihi', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
    )
    .setFooter({ text: `Ceza ID: ${cezaId} | JÖH Disiplin Sistemi` })
    .setTimestamp();

  if (logChannel) {
    await logChannel.send({ embeds: [logEmbed] });
  }

  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Ceza Onaylandı & Kaydedildi')
    .setDescription(
      `Ceza başarıyla onaylandı ve log kanalına kaydedildi.\n\n` +
      `📋 **Log Kanalı:** ${logChannel ? logChannel : '`#ceza-log`'}\n` +
      `🗓️ **Onaylayan:** ${interaction.member}\n\n` +
      `> Kanal 10 saniye içinde silinecektir.`
    )
    .setColor(0x57F287)
    .setTimestamp();

  await interaction.editReply({ embeds: [confirmEmbed] });

  pendingPenalties.delete(cezaId);

  setTimeout(async () => {
    await interaction.channel.delete('Ceza onaylandı ve kaydedildi').catch(() => {});
  }, 10000);
}

async function cancelPenalty(interaction) {
  if (!interaction.member.roles.cache.has(UST_YONETIM_ROLE_ID)) {
    return interaction.reply({ content: '🚫 Yetkiniz yok.', ephemeral: true });
  }

  const cezaId = interaction.customId.replace('ceza_iptal_', '');
  pendingPenalties.delete(cezaId);

  const embed = new EmbedBuilder()
    .setTitle('❌ Ceza İptal Edildi')
    .setDescription(`${interaction.member} tarafından ceza işlemi iptal edildi.\n\nKanal 5 saniye içinde silinecektir.`)
    .setColor(0xED4245)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  setTimeout(async () => {
    await interaction.channel.delete('Ceza iptal edildi').catch(() => {});
  }, 5000);
}

client.login(TOKEN);
