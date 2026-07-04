const userService = require('@/services/modules/user')

const userController = {
  /**
   * 获取用户列表
   */
  getUserList: async (req, res, next) => {
    try {
      const users = await userService.getUserList()

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

  /**
   * 创建用户
   */
  createUser: async (req, res, next) => {
    // try {
    //   const users = await userService.createUser()

    //   // 统一返回格式
    //   res.status(200).json({
    //     success: true,
    //     message: '获取用户列表成功',
    //     data: users,
    //   })
    // } catch (error) {
    //   // 将错误传递给全局错误处理中间件
    //   next(error)
    // }
    try {
      const { name, mobile, password, email } = req.body
      // 校验必传参数
      if (!mobile || !password) {
        return res
          .status(400)
          .json({ code: 400, msg: '手机号和密码为必填项', data: null })
      }

      // 调用service中的方法
      const newUser = await userService.createUser({
        name,
        mobile,
        password,
        email,
      })
      res.json({ code: 200, msg: '新增成功', data: newUser })
    } catch (error) {
      res.status(500).json({ code: 500, msg: error.message, data: null })
    }
  },
}

module.exports = userController
