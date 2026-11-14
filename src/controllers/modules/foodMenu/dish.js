const dishService = require('@/services/modules/foodMenu/dish')
// 引入：封装的异步处理工具
const asyncHandler = require('@/utils/asyncHandler')
// 引入：封装的统一响应工具
const { success } = require('@/utils/responseHandler')
const { LOG_MODULE } = require('@/logger/constants')
const { logBusinessEvent } = require('@/logger/businessLogger')

const dishController = {
  /**
   * 获取菜品列表
   */
  getDishList: asyncHandler(async (req, res) => {
    const { name, categoryIds } = req.query
    const query = {
      name,
      categoryIds,
      familyId: 1
    }
    const list = await dishService.getDishList(query)
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

    // 业务操作成功后记录日志
    logBusinessEvent({
      req,
      module: LOG_MODULE.DISH,
      action: 'create',
      familyId: 1,
      targetId: newData.id,
      message: '新增菜品成功'
    })

    success(res, newData)
  })
}

module.exports = dishController
