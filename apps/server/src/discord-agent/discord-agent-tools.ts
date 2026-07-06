export const AGENT_TOOLS = [
  {
    name: 'get_user_warnings',
    description: 'Dapatkan riwayat warning aktif dan expired milik seorang user.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord User ID target' },
      },
      required: ['targetUserId'],
    },
  },
  {
    name: 'warn_user',
    description: 'Buat usulan warning baru untuk user. Membutuhkan approval.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord User ID target' },
        reason: { type: 'STRING', description: 'Alasan pemberian warning' },
      },
      required: ['targetUserId', 'reason'],
    },
  },
  {
    name: 'timeout_user',
    description: 'Buat usulan timeout/mute untuk user. Membutuhkan approval.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord User ID target' },
        durationMinutes: { type: 'INTEGER', description: 'Durasi timeout dalam menit, default 10' },
        reason: { type: 'STRING', description: 'Alasan timeout' },
      },
      required: ['targetUserId', 'durationMinutes', 'reason'],
    },
  },
  {
    name: 'get_server_settings',
    description: 'Membaca slowmode, anomaly, phishing, dan log channel settings.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'update_server_settings',
    description: 'Buat usulan pembaruan settings server (slowmode, anomaly, phishing). Membutuhkan approval.',
    parameters: {
      type: 'OBJECT',
      properties: {
        logChannelId: { type: 'STRING', description: 'ID channel untuk log moderasi' },
        slowmodeEnabled: { type: 'BOOLEAN', description: 'Mengaktifkan slowmode otomatis' },
        anomalyEnabled: { type: 'BOOLEAN', description: 'Mengaktifkan anomaly detection' },
        phishingDetectionEnabled: { type: 'BOOLEAN', description: 'Mengaktifkan phishing detection' },
      },
    },
  },
  {
    name: 'get_channel_message_logs',
    description: 'Mendapatkan histori pesan terbaru seorang user lintas channel untuk diinvestigasi.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord User ID target' },
        limit: { type: 'INTEGER', description: 'Jumlah pesan maks, default 15' },
      },
      required: ['targetUserId'],
    },
  },
];
