const crypto = require('node:crypto')
const moduleEnum = require('@/data/enum/attachment')

// todo：校验家庭id
// function validateFamilyId(familyId) {
//   const value = String(familyId ?? '')

//   if (!/^[1-9]\d*$/.test(value)) {
//     const error = new Error('无效的 familyId')
//     error.status = 400
//     throw error
//   }
//   return value
// }

// 校验附件所属业务模块
const validateModule = (module) => {
  if (!moduleEnum.includes(module)) {
    const error = new Error('附件模块不存在，请确认后重新上传')
    error.status = 400
    throw error
  }
  return module
}

// 生成 ObjectKey
const generateObjectKey = ({ familyId, module }) => {
  // const safeFamilyId = validateFamilyId(familyId)
  const safeModule = validateModule(module)

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  // 这里使用随机 UUID，避免客户端控制对象路径
  // todo：后续正式接入用户认证时，路径还应包含经过认证的 userId
  const uuid = crypto.randomUUID()
  return [`family_${familyId}`, safeModule, year, month, `${uuid}`].join('/')
}

module.exports = {
  generateObjectKey
}
