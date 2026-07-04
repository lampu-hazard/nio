import { IsEmail, IsInt, IsString, Min } from 'class-validator';

export class CheckoutTakoDto {
  @IsInt()
  @Min(1000)
  amount!: number;

  @IsEmail()
  email!: string;

  @IsString()
  paymentMethod!: string;
}
