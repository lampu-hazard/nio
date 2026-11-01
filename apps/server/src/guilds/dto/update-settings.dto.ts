import { IsBoolean, IsOptional, IsString, IsArray, IsInt, Min, Max, ValidateIf, ValidateNested, ArrayMaxSize, Matches } from 'class-validator';
import { Type } from 'class-transformer';

export class VoiceXpRewardDto {
  @IsInt()
  @Min(1)
  @Max(10000)
  level!: number;

  @IsString()
  @Matches(/^\d{17,20}$/)
  roleId!: string;
}

export class UpdateSettingsDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  voiceXpEnabled?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(1000)
  voiceXpPerMinute?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{17,20}$/)
  voiceNotificationChannelId?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => VoiceXpRewardDto)
  voiceXpRewards?: VoiceXpRewardDto[];

  @IsOptional()
  @IsString()
  logChannelId?: string | null;

  @IsOptional()
  @IsString()
  messageDeleteLogChannelId?: string | null;

  @IsOptional()
  @IsBoolean()
  stickerEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  hallOfFameEnabled?: boolean;

  @IsOptional()
  @IsString()
  hallOfFameChannelId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  hallOfFameThreshold?: number;

  @IsOptional()
  @IsBoolean()
  slowmodeEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  slowmodeChannels?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(21600)
  slowmodeIntervalQuiet?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(21600)
  slowmodeIntervalNormal?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(21600)
  slowmodeIntervalBusy?: number;

  @IsOptional()
  @IsBoolean()
  anomalyEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  phishingDetectionEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  contentAnomalyEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  userAnomalyEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  guildBaselineEnabled?: boolean;

  @IsOptional()
  @IsString()
  anomalyEnforcementMode?: string;
}
