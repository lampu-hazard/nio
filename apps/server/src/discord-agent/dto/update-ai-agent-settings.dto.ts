import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAiAgentSettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsIn(['gemini', 'openai-compatible']) provider?: string;
  @IsOptional() @IsString() @MaxLength(120) model?: string;
  @IsOptional() @IsString() @MaxLength(500) baseUrl?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) allowedUserIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) allowedChannelIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) excludedChannelIds?: string[];
  @IsOptional() @IsString() @MaxLength(512) apiKey?: string;
  @IsOptional() @IsBoolean() clearApiKey?: boolean;
}
