const foodOrderService = require('@/services/modules/foodMenu/foodOrder')
// 引入：封装的异步处理工具
const asyncHandler = require('@/utils/asyncHandler')
// 引入：封装的统一响应工具
const { success, fail } = require('@/utils/responseHandler')
const codeEnum = require('@/data/enum/code')

const foodOrderController = {
  /**
   * 获取食物订单列表
   */
  getFoodOrderList: asyncHandler(async (req, res) => {
    const list = await foodOrderService.getFoodOrderList()
    success(res, list)
  }),

  /**
   * 新增食物订单
   */
  createFoodOrder: asyncHandler(async (req, res) => {
    const { dishArr, remark } = req.body
    // 校验必传参数
    if (!dishArr || !Array.isArray(dishArr) || dishArr.length === 0) {
      return fail(res, '菜品不能为空', 400, codeEnum.paramInvalid)
    }

    const tempParams = {
      dishArr: dishArr,
      remark: remark,
      createId: 1
    }
    // 调用service中的方法
    const newData = await foodOrderService.createFoodOrder(tempParams)
    success(res, newData)
  })
}

module.exports = foodOrderController
