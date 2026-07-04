import { IsBoolean, IsInt, IsOptional, Min, Max } from 'class-validator';

export class UpdateModerationSettingsDto {
  @IsOptional()
  @IsBoolean()
  warnLimitEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  warnLimitThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(43200) // max 30 days timeout
  warnTimeoutDurationMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650) // max 10 years expiry
  warnExpiryDays?: number;
}
