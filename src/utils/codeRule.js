/**
 * 生成食物订单编号
 * @param {*} id 新增的食物订单id
 * @returns
 */
const generateFoodOrderCode = (id) => {
  let tempCode = ''
  if (id > 0) {
    const now = new Date()
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const codeNumber = id.toString().padStart(4, '0')
    tempCode = `FO${date}${codeNumber}`
  }
  return tempCode
}

module.exports = { generateFoodOrderCode }
