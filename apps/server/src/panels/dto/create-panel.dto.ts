import { IsHexColor, IsIn, IsInt, IsObject, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import type { PanelVisualDocument } from '../visual/panel-visual.document';

export class CreatePanelDto {
  @IsOptional() @IsString() channelId?: string;
  @IsString() @MaxLength(100) name!: string;
  @IsString() @MaxLength(256) title!: string;
  @IsOptional() @IsString() @MaxLength(256) accentText?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsIn(['SELF_ROLE', 'RULES', 'ANNOUNCEMENT', 'LEADERBOARD']) type: 'SELF_ROLE' | 'RULES' | 'ANNOUNCEMENT' | 'LEADERBOARD' = 'SELF_ROLE';
  @IsIn(['BUTTONS', 'MENU']) mode: 'BUTTONS' | 'MENU' = 'BUTTONS';
  @IsIn(['PREMIUM', 'MINIMAL', 'COLORFUL', 'NEON']) style: 'PREMIUM' | 'MINIMAL' | 'COLORFUL' | 'NEON' = 'PREMIUM';
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsUrl() imageUrl?: string | null;
  @IsOptional() @IsUrl() thumbnailUrl?: string | null;
  @IsOptional() @IsObject() visualDocument?: PanelVisualDocument | null;
  @IsOptional() @IsInt() @Min(0) expectedRevision?: number;
  @IsOptional() @IsString() requireRoleId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(25) maxRoles?: number;
}
