import { IsHexColor, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class CreatePanelDto {
  @IsOptional() @IsString() channelId?: string;
  @IsString() name!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() accentText?: string;
  @IsOptional() @IsString() description?: string;
  @IsIn(['SELF_ROLE', 'RULES', 'ANNOUNCEMENT']) type: 'SELF_ROLE' | 'RULES' | 'ANNOUNCEMENT' = 'SELF_ROLE';
  @IsIn(['BUTTONS', 'MENU']) mode: 'BUTTONS' | 'MENU' = 'BUTTONS';
  @IsIn(['PREMIUM', 'MINIMAL', 'COLORFUL', 'NEON']) style: 'PREMIUM' | 'MINIMAL' | 'COLORFUL' | 'NEON' = 'PREMIUM';
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsUrl() imageUrl?: string;
  @IsOptional() @IsUrl() thumbnailUrl?: string;
  @IsOptional() @IsString() requireRoleId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(25) maxRoles?: number;
}
