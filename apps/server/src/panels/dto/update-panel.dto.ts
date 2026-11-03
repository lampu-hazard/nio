import { PartialType } from '@nestjs/mapped-types';
import { CreatePanelDto } from './create-panel.dto';

export class UpdatePanelDto extends PartialType(CreatePanelDto) {
  constructor() {
    super();
    this.type = undefined;
    this.mode = undefined;
    this.style = undefined;
  }
}
