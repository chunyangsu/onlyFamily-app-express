const { Op } = require('sequelize')
const { attachmentList } = require('../models')
const sequelize = require('../config/database')

// 复用项目中已有的 OSS 客户端。
// 请将路径替换为实际 OSS 配置文件，并确保该客户端有读取对象元数据的权限。
const ossClient = require('../config/oss')

// 单次最多登记 20 个附件
const MAX_BATCH_SIZE = 20

// 按当前项目的业务分类调整。
// category 必须与 OSS 对象路径中的分类目录一致。
// const ALLOWED_CATEGORIES = new Set(['food', 'avatar', 'recipe', 'bill', 'album', 'attachment'])

/**
 * 校验单个附件参数
 */
// function validateAttachment(item, index) {
//   if (!item || typeof item !== 'object' || Array.isArray(item)) {
//     throw createError(400, `第 ${index + 1} 个附件参数格式错误`)
//   }

//   const { objectKey, category, originalName } = item

//   if (typeof objectKey !== 'string' || !objectKey.trim()) {
//     throw createError(400, `第 ${index + 1} 个附件缺少 objectKey`)
//   }

//   if (objectKey.length > 512) {
//     throw createError(400, `第 ${index + 1} 个附件 objectKey 过长`)
//   }

//   // 不接受 URL、绝对路径、路径穿越或异常路径。
//   if (objectKey.startsWith('/') || objectKey.includes('\\') || objectKey.includes('..') || /^https?:\/\//i.test(objectKey)) {
//     throw createError(400, `第 ${index + 1} 个附件 objectKey 不合法`)
//   }

//   if (typeof category !== 'string' || !ALLOWED_CATEGORIES.has(category)) {
//     throw createError(400, `第 ${index + 1} 个附件 category 不合法`)
//   }

//   // 当前约定：对象路径为 family/{category}/...
//   if (!objectKey.startsWith(`family/${category}/`)) {
//     throw createError(400, `第 ${index + 1} 个附件的 category 与 objectKey 不匹配`)
//   }

//   if (originalName != null && (typeof originalName !== 'string' || originalName.length > 255)) {
//     throw createError(400, `第 ${index + 1} 个附件 originalName 不合法`)
//   }

//   return {
//     objectKey,
//     category,
//     originalName: originalName?.trim() || null
//   }
// }

function createError(status, message) {
  const error = new Error(message)
  error.status = status
  error.code = status === 409 ? 40900 : 40000
  return error
}

/**
 * 批量登记附件
 * @param {Array} attachments 附件参数数组
 * @param {number|string} userId 当前登录用户 ID
 */
async function createAttachments(attachments, userId) {
  // if (!Array.isArray(attachments) || attachments.length === 0) {
  //   throw createError(400, 'attachments 必须是非空数组')
  // }

  // if (attachments.length > MAX_BATCH_SIZE) {
  //   throw createError(400, `单次最多登记 ${MAX_BATCH_SIZE} 个附件`)
  // }

  // if (userId === null || userId === '') {
  //   throw createError(401, '请先登录')
  // }

  // const items = attachments.map(validateAttachment)

  // 请求内部不能重复提交同一个对象。
  // const objectKeys = items.map((item) => item.objectKey)
  // if (new Set(objectKeys).size !== objectKeys.length) {
  //   throw createError(400, '请求中存在重复的 objectKey')
  // }

  // 并行检查 OSS 对象是否存在。
  // head() 只读取对象元数据，不会下载文件内容。
  // const headResults = await Promise.allSettled(items.map((item) => ossClient.head(item.objectKey)))

  // const missingIndexes = []

  // headResults.forEach((result, index) => {
  //   if (result.status === 'rejected') {
  //     const status = result.reason?.status
  //     const code = result.reason?.code

  //     // 404 表示对象不存在。
  //     if (status === 404 || code === 'NoSuchKey') {
  //       missingIndexes.push(index + 1)
  //       return
  //     }

  //     // 其他错误可能是权限、网络或 OSS 配置问题，
  //     // 不能错误地当作“文件不存在”。
  //     const error = new Error('检查 OSS 对象失败，请稍后重试')
  //     error.status = 502
  //     error.code = 50201
  //     throw error
  //   }
  // })

  // if (missingIndexes.length > 0) {
  //   throw createError(400, `以下附件在 OSS 中不存在：第 ${missingIndexes.join('、')} 个`)
  // }

  // 检查数据库中是否已经登记。
  // const existing = await attachmentList.findAll({
  //   attributes: ['objectKey'],
  //   where: {
  //     objectKey: {
  //       [Op.in]: objectKeys
  //     }
  //   },
  //   raw: true
  // })

  // if (existing.length > 0) {
  //   throw createError(409, `以下 objectKey 已登记：${existing.map((item) => item.objectKey).join('、')}`)
  // }

  // 全部记录放在同一事务中。
  // createId 只能来自后端认证上下文。
  const transaction = await sequelize.transaction()

  try {
    const records = await attachmentList.bulkCreate(
      items.map((item) => ({
        ...item,
        createId: userId
      })),
      {
        transaction,
        validate: true,
        returning: true
      }
    )

    await transaction.commit()

    return records.map((record) => ({
      id: record.id,
      objectKey: record.objectKey,
      category: record.category,
      originalName: record.originalName,
      createId: record.createId,
      createdAt: record.createdAt
    }))
  } catch (error) {
    await transaction.rollback()

    // 数据库唯一索引仍然是最终的重复保护，
    // 因为并发请求可能同时通过前面的重复检查。
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw createError(409, '部分附件已登记，请刷新后重试')
    }

    throw error
  }
}

module.exports = {
  createAttachments
}
