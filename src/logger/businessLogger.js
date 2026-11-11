const logger = require('./index')
const { LOG_TYPE } = require('./constants')

/**
 * 记录业务操作日志
 *
 * @param {Object} options
 * @param {Object} options.req Express 请求对象
 * @param {string} options.module 业务模块
 * @param {string} options.action 业务操作
 * @param {number|string} [options.familyId] 家庭 ID
 * @param {number|string} [options.targetId] 被操作的数据 ID
 * @param {string} [options.message] 日志描述
 */
const logBusinessEvent = ({ req, module, action, familyId, targetId, message }) => {
  logger.info(
    {
      type: LOG_TYPE.BUSINESS,
      module,
      action,
      requestId: req?.id,
      userId: req?.user?.id ?? null,
      familyId: familyId ?? null,
      targetId: targetId ?? null
    },
    message || `${module}.${action}`
  )
}

module.exports = {
  logBusinessEvent
}
