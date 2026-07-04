import { IsBoolean, IsHexColor, IsOptional, IsString, Length, Matches } from 'class-validator';

export class ClaimRoleDto {
  @IsString()
  token!: string;

  @IsString()
  @Length(2, 32)
  @Matches(/^(?!.*@(?:everyone|here))[\p{L}\p{N} ._\-]+$/u, {
    message: 'Role name may only contain letters, numbers, spaces, dots, underscores, and hyphens.',
  })
  name!: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @IsOptional()
  @IsHexColor()
  secondaryColor?: string;

  @IsOptional()
  @IsHexColor()
  tertiaryColor?: string;

  @IsOptional()
  @IsString()
  iconDataUrl?: string;

  @IsOptional()
  @IsBoolean()
  removeIcon?: boolean;
}
