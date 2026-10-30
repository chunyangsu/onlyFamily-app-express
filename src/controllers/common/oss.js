const { createUploadPolicy } = require('@/services/common/oss')
// 引入：封装的异步处理工具
const asyncHandler = require('@/utils/asyncHandler')
// 引入：封装的统一响应工具
const { success } = require('@/utils/responseHandler')

const ossController = {
  /**
   * 获取上传凭证
   * 负责：
   * 1. 校验用户身份和上传权限
   * 2. 校验上传分类与 Content-Type
   * 3. 生成受限的 OSS V4 PostObject Policy
   * 4. 获取 STS 临时凭证
   */
  getUploadPolicy: asyncHandler(async (req, res) => {
    const familyId = req.headers['family-id']
    const { module } = req.body

    const tempParams = {
      familyId,
      module
    }
    // 调用service中的方法
    const newData = await createUploadPolicy(tempParams)
    success(res, newData, '获取上传授权成功')
  })
}

module.exports = ossController
