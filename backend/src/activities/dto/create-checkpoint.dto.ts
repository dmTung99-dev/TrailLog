import { IsDateString, IsNumber } from 'class-validator';

export class CreateCheckpointDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsDateString()
  capturedAt!: string;
}
