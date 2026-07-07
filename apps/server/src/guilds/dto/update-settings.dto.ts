import { IsBoolean, IsOptional, IsString, IsArray, IsInt, Min, Max } from 'class-validator';

export class UpdateSettingsDto {
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
