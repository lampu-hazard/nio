import { Injectable } from '@nestjs/common';
import { joinVoiceChannel, getVoiceConnection, VoiceConnection } from '@discordjs/voice';

@Injectable()
export class DiscordVoiceConnectionService {
  private readonly connections = new Map<string, VoiceConnection>();

  join(guildId: string, channelId: string, adapterCreator: any) {
    const existing = getVoiceConnection(guildId);
    existing?.destroy();

    const connection = joinVoiceChannel({
      guildId,
      channelId,
      adapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    this.connections.set(guildId, connection);
    return { guildId, channelId };
  }

  leave(guildId: string) {
    const connection = getVoiceConnection(guildId) || this.connections.get(guildId);
    if (!connection) return { guildId, left: false };

    connection.destroy();
    this.connections.delete(guildId);
    return { guildId, left: true };
  }
}
