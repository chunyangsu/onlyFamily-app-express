// src/controllers/modules/userController.js
const user = require('@/services/modules/user')

const User = {
  /**
   * 获取用户列表接口
   */
  getList: async (req, res, next) => {
    try {
      const users = await user.getUserList()

      // 统一返回格式
      res.status(200).json({
        success: true,
        message: '获取用户列表成功',
        data: users,
      })
    } catch (error) {
      // 将错误传递给全局错误处理中间件
      next(error)
    }
  },
}

module.exports = User
