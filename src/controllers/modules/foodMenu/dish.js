const dishService = require('@/services/modules/foodMenu/dish')
// 引入：封装的异步处理工具
const asyncHandler = require('@/utils/asyncHandler')
// 引入：封装的统一响应工具
const { success, fail } = require('@/utils/responseHandler')
const codeEnum = require('@/data/enum/code')

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
    const { name, categoryId, price } = req.body
    // 校验必传参数
    if (!name) {
      return fail(res, '菜品名称不能为空', 400, codeEnum.paramInvalid)
    }

    const tempParams = {
      name: name,
      categoryId: categoryId,
      price: price,
      createId: 1
    }
    // 调用service中的方法
    const newData = await dishService.createDish(tempParams)
    success(res, newData)
  })
}

module.exports = dishController
