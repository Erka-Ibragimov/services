import { Controller, Put } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Put('reset-problems')
  async resetProblems(): Promise<{ count: number }> {
    const count = await this.userService.resetUserProblems();
    return { count };
  }
}
