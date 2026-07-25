const dishCategoryService = require('@/services/modules/foodMenu/dishCategory')
// 引入：封装的异步处理工具
const asyncHandler = require('@/utils/asyncHandler')
// 引入：封装的统一响应工具
const { success, fail } = require('@/utils/responseHandler')
const codeEnum = require('@/data/enum/code')

const dishCategoryController = {
  /**
   * 获取菜品分类列表
   */
  getDishCategoryList: asyncHandler(async (req, res) => {
    const list = await dishCategoryService.getDishCategoryList()
    success(res, list)
  }),

  /**
   * 新增菜品分类
   */
  createDishCategory: asyncHandler(async (req, res) => {
    const { name } = req.body
    // 校验必传参数
    if (!name) {
      return fail(res, '分类名称不能为空', 400, codeEnum.paramInvalid)
    }

    // 调用service中的方法
    const newData = await dishCategoryService.createDishCategory({
      name
    })
    success(res, newData)
  })
}

module.exports = dishCategoryController
