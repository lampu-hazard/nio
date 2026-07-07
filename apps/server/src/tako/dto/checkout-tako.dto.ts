import { IsEmail, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CheckoutTakoDto {
  @IsInt()
  @Min(1000)
  amount!: number;

  @IsEmail()
  email!: string;

  @IsString()
  paymentMethod!: string;

  @IsOptional()
  @IsString()
  discordUserId?: string;

  @IsOptional()
  @IsString()
  discordUsername?: string;
}
