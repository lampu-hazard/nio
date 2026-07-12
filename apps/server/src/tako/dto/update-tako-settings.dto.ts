import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsArray, Min, ValidateNested } from 'class-validator';

export class TakoRewardTierDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  thresholdAmount?: number;

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class UpdateTakoSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  creatorSlug?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  webhookToken?: string;

  @IsOptional()
  @IsString()
  rewardRoleId?: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  minimumAmount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  paymentMethods?: string[];

  @IsOptional()
  @IsString()
  logChannelId?: string | null;

  @IsOptional()
  @IsBoolean()
  directNotificationsEnabled?: boolean;

  @IsOptional()
  @IsString()
  directNotificationChannelId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  directNotifyMinimumAmount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TakoRewardTierDto)
  rewardTiers?: TakoRewardTierDto[];
}
