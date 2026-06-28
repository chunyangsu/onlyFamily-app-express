// import { Request, Response, NextFunction } from 'express'
// import { UserModel } from '@/models/user.model';
// import { ResponseHandler } from '@/utils/response';
// import { AppError } from '@/middleware/error.handler';

/**
 * 用户管理的控制器
 */
export class User {
  static async getUserList(req: any, res: any, next: any) {
    try {
      res.send('获取用户列表1')
      // const users = await UserModel.findAll()
      // ResponseHandler.success(res, users, '获取用户列表成功')
    } catch (error) {
      next(error)
    }
  }
}
