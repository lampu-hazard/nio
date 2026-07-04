import { IsBoolean, IsInt, IsOptional, IsString, IsArray, Min } from 'class-validator';

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
}
