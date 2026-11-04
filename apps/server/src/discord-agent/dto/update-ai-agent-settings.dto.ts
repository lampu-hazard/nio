import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class AgentRoleRuleDto {
  @IsString() roleId!: string;
  @IsBoolean() chatEnabled!: boolean;
  @IsBoolean() imageEnabled!: boolean;
  @IsInt() @Min(0) @Max(100000000) dailyTokenLimit!: number;
  @IsInt() @Min(0) @Max(1000) dailyImageLimit!: number;
}

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
  @IsOptional() @IsIn(['LEGACY_USERS', 'ROLE_QUOTAS']) accessMode?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => AgentRoleRuleDto) roleRules?: AgentRoleRuleDto[];
  @IsOptional() @IsInt() @Min(1) @Max(1000000000) dailyGuildTokenLimit?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) dailyGuildImageLimit?: number;
  @IsOptional() @IsInt() @Min(128) @Max(8192) maxOutputTokens?: number;
  @IsOptional() @IsInt() @Min(1024) @Max(262144) maxRunTokens?: number;
  @IsOptional() @IsBoolean() imageEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(500) imageBaseUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(120) imageModel?: string | null;
  @IsOptional() @IsIn(['SEPARATE', 'CHAT']) imageCredentialSource?: string;
  @IsOptional() @IsString() @MaxLength(512) imageApiKey?: string;
  @IsOptional() @IsBoolean() clearImageApiKey?: boolean;
}
