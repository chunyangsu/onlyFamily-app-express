const familyService = require('@/services/modules/family')
// 引入：封装的异步处理工具
const asyncHandler = require('@/utils/asyncHandler')
// 引入：封装的统一响应工具
const { success, fail } = require('@/utils/responseHandler')
const codeEnum = require('@/data/enum/code')

const familyController = {
  /**
   * 获取菜品列表
   */
  // getDishList: asyncHandler(async (req, res) => {
  //   const list = await familyService.getDishList()
  //   success(res, list)
  // }),

  /**
   * 新增家庭
   */
  createFamily: asyncHandler(async (req, res) => {
    const userId = req.user.id
    const { name, introduction } = req.body
    // 校验必传参数
    if (!name || name === '') {
      return fail(res, '家庭名称不能为空', 400, codeEnum.paramInvalid)
    }

    const params = {
      name,
      introduction,
      userId
    }
    // 调用service中的方法
    const newData = await familyService.createFamily(params)
    success(res, newData)
  }),

  /**
   * 加入家庭
   */
  joinFamily: asyncHandler(async (req, res) => {
    const userId = req.user.id
    const { familyId } = req.body
    // 校验必传参数
    // if (!name) {
    //   return fail(res, '菜品名称不能为空', 400, codeEnum.paramInvalid)
    // }
    const params = {
      userId,
      familyId
    }
    // 调用service中的方法
    const newData = await familyService.joinFamily(params)
    success(res, newData)
  })
}

module.exports = familyController
