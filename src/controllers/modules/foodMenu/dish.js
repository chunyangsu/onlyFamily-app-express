const dishService = require('@/services/modules/foodMenu/dish')
// 引入：封装的异步处理工具
const asyncHandler = require('@/utils/asyncHandler')
// 引入：封装的统一响应工具
const { success } = require('@/utils/responseHandler')

const dishController = {
  /**
   * 获取菜品列表
   */
  getDishList: asyncHandler(async (req, res) => {
    const list = await dishService.getDishList()
    success(res, list)
  }),

  /**
   * 新增菜品
   */
  createDish: asyncHandler(async (req, res) => {
    const userId = req.user.id
    const { name, attachmentId, categoryId, introduction, makeProcess, price } = req.validated.body

    const params = {
      name,
      attachmentId,
      categoryId,
      introduction,
      makeProcess,
      price,
      createId: userId
    }
    // 调用service中的方法
    const newData = await dishService.createDish(params)
    success(res, newData)
  })
}

module.exports = dishController
